module.exports = function(React) {

var IS_PREACT = (React.h instanceof Function);
var Meanwhile = require('./meanwhile');

/**
 * Harvest HTML and text nodes
 *
 * @param  {[type]} node
 *
 * @return {Promise<Vnode>}
 */
function harvest(node) {
    try {
        var harvested = harvestNode(node, {});
        if (!isPromise(harvested)) {
            // always return a promise
            harvested = Promise.resolve(harvested);
        }
        return harvested;
    } catch (err) {
        return Promise.reject(err);
    }
}

/**
 * Harvest HTML and text nodes
 *
 * @param  {VNode} node
 * @param  {Object} context
 *
 * @return {VNode|Promise<VNode>}
 */
function harvestNode(node, context) {
    if (!(node instanceof Object)) {
		return node;
	}
    var asyncRendering = null;
    var type = getNodeType(node);
    if (type instanceof Function) {
        // it's a component
        var rendered;
        var props = getNodeProps(node, type);
        if (type.prototype && type.prototype.render instanceof Function) {
            // stateful component
            var componentClass = type;
            var component = new componentClass(props, context);
            component.props = props;
            component.context = context;
            var state = component.state;
            if (componentClass.getDerivedStateFromProps) {
                var originalState = state;
                var derivedState = componentClass.getDerivedStateFromProps(props, originalState);
                state = {};
                assign(state, originalState);
                assign(state, derivedState);
                component.state = state;
            } else if (component.componentWillMount) {
                if (!IS_PREACT) {
                    component.updater = ReactUpdater;
                }
                component.componentWillMount();
                state = component.state;
            } else if (component.UNSAFE_componentWillMount) {
                if (!IS_PREACT) {
                    component.updater = ReactUpdater;
                }
                component.UNSAFE_componentWillMount();
                state = component.state;
            }
            if (component.relaks && component.renderAsync instanceof Function) {
                // create bogus meanwhile object that doesn't do anything
                var meanwhile = new Meanwhile(component);
                if (IS_PREACT) {
                    rendered = component.renderAsync(meanwhile, props, state, context);
                } else {
                    rendered = component.renderAsync(meanwhile);
                }
                if (isPromise(rendered)) {
                    asyncRendering = rendered;
                }
            } else {
                if (IS_PREACT) {
                    rendered = component.render(props, state, context);
                } else {
                    rendered = component.render();
                }
            }
        } else {
            // stateless component
            var statelessComponentFunc = type;
            rendered = statelessComponentFunc(props, context);
        }
        if (!asyncRendering) {
            // harvest what was rendered
            return harvestNode(rendered, context);
        } else {
            // wait for asynchronous rendering to finish
            return asyncRendering.then(function(rendered) {
                return harvestNode(rendered, context);
            });
        }
    } else {
        // harvest HTML+text nodes from children
        return harvestChildren(node, context);
    }
}

/**
 * Harvest HTML and text nodes of a node's children
 *
 * @param  {ReactElement|VNode} node
 * @param  {Object} context
 *
 * @return {ReactElement|VNode|Promise<ReactElement|VNode>}
 */
function harvestChildren(node, context) {
    var children = getNodeChildren(node);
    var newChildren;
    if (children instanceof Array) {
        newChildren = harvestNodes(children, context);
    } else {
        newChildren = harvestNode(children, context);
    }
    var asyncRendering = null;
    if (isPromise(newChildren)) {
        asyncRendering = newChildren;
    }
    if (newChildren === children) {
        return node;
    }
    if (!asyncRendering) {
        // return new node with new children immediate
        return replaceChildren(node, newChildren);
    } else {
        // wait for asynchrounous rendering of children
        return asyncRendering.then(function(newChildren) {
            return replaceChildren(node, newChildren);
        });
    }
}

/**
 * Harvest HTML and text nodes from an array
 *
 * @param  {Array<ReactElement|VNode>} node
 * @param  {Object} context
 *
 * @return {Array|Promise<Array>}
 */
function harvestNodes(nodes, context) {
    var changed = false;
    var asyncRenderingRequired = false;
    var newNodes = nodes.map(function(element) {
        var harvested;
        if (element instanceof Array) {
            harvested = harvestNodes(element, context);
        } else {
            harvested = harvestNode(element, context);
        }
        if (isPromise(harvested)) {
            asyncRenderingRequired = true;
        }
        changed = changed || (harvested !== element);
        return harvested;
    });
    if (!asyncRenderingRequired) {
        // return original list if nothing has changed
        return changed ? newNodes : nodes;
    } else {
        // wait for promises to resolve
        return Promise.all(newNodes);
    }
}

/**
 * Return a new node if children are different
 *
 * @param  {ReactElement|VNode} node
 * @param  {Array} newChildren
 *
 * @return {ReactElement|VNode}
 */
function replaceChildren(node, newChildren) {
    return React.cloneElement(node, undefined, newChildren);
}

/**
 * Copy properties
 *
 * @param  {Object} dest
 * @param  {Object} src
 *
 * @return {Object}
 */
function assign(dest, src) {
    for (var name in src) {
        dest[name] = src[name];
    }
    return dest;
}

/**
 * Return a node's type
 *
 * @param  {ReactElement|VNode} node
 *
 * @return {String|Function}
 */
function getNodeType(node) {
    return (IS_PREACT) ? node.nodeName : node.type;
}

/**
 * Return the props of a node
 *
 * @param  {ReactElement|VNode} node
 * @param  {Function} type
 *
 * @return {Object}
 */
function getNodeProps(node, type) {
	var props = {}
    if (IS_PREACT) {
        assign(props, node.attributes);
        props.children = node.children;
    } else {
        assign(props, node.props);
        Object.defineProperty(props, 'children', { value: node.props.children });
    }

    // apply default props
    var defaultProps = type.defaultProps;
    for (var name in defaultProps) {
        if (props[name] === undefined) {
            props[name] = defaultProps[name];
        }
    }
	return props;
}

/**
 * Return the children of a node
 *
 * @param  {ReactElement|VNode} node
 *
 * @return {*}
 */
function getNodeChildren(node) {
    if (IS_PREACT) {
        return node.children;
    } else {
        return node.props.children;
    }
}

/**
 * Return true if given value hold a promise
 *
 * @param  {*}  value
 *
 * @return {Boolean}
 */
function isPromise(value) {
    return (value instanceof Object && value.then instanceof Function);
}

if (!IS_PREACT) {
    var ReactUpdater = {
        enqueueCallback: function(inst, f) {
            f();
        },
        enqueueForceUpdate: function(inst) {
        },
        enqueueReplaceState: function(inst, state) {
            var newState = {};
            assign(newState, inst);
            assign(newState, state);
            inst.state = newState;
        },
        enqueueSetState: function(inst, partialState) {
            var newState = {};
            assign(newState, inst.state);
            assign(newState, partialState);
            inst.state = newState;
        },
        isMounted: function() {
            return true;
        },
    }
}

harvest.harvest = harvest;
return harvest;
};
