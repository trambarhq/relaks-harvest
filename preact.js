import Preact from 'preact';

/**
 * Harvest HTML and text nodes
 *
 * @param  {VNode} node
 * @param  {Object|undefined} options
 *
 * @return {Promise<Vnode>}
 */
function harvest(node, options) {
    try {
        // see if we're collecting seeds
        var bucket = (options && options.seeds) ? [] : null;
        var harvested = harvestNode(node, {}, bucket);
        if (!isPromise(harvested)) {
            // always return a promise
            harvested = Promise.resolve(harvested);
        }
        if (bucket) {
            return harvested.then(function() {
                return bucket;
            });
        } else {
            return harvested;
        }
    } catch (err) {
        return Promise.reject(err);
    }
}

/**
 * Harvest HTML and text nodes
 *
 * @param  {VNode} node
 * @param  {Array<Object>} contexts
 * @param  {undefined|Array}
 *
 * @return {VNode|Array|null|Promise<VNode|null>}
 */
function harvestNode(node, contexts, bucket) {
    if (!(node instanceof Object)) {
		return (!bucket) ? node : null;
	}
    var type = getNodeType(node);
    if (type instanceof Function) {
        // it's a component
        var props = getNodeProps(node, type);
        var rendered = renderComponent(type, props, contexts);
        if (isPromise(rendered)) {
            // wait for asynchronous rendering to finish
            return rendered.then(function(rendered) {
                if (bucket) {
                    bucket.push({
                        type: type,
                        props: props,
                        result: rendered
                    });
                }
                return harvestNode(rendered, contexts, bucket);
            });
        } else {
            // harvest what was rendered
            if (rendered instanceof Array) {
                return harvestNodes(rendered, contexts, bucket);
            } else {
                return harvestNode(rendered, contexts, bucket);
            }
        }
    } else {
        // harvest HTML+text nodes from children
        var children = getNodeChildren(node);
        var newChildren;
        if (children instanceof Array) {
            newChildren = harvestNodes(children, contexts, bucket);
        } else {
            newChildren = harvestNode(children, contexts, bucket);
        }
        if (newChildren === children) {
            // no change
            return (!bucket) ? node : null;
        }
        if (isPromise(newChildren)) {
            // wait for asynchrounous rendering of children
            return newChildren.then(function(newChildren) {
                return (!bucket) ? replaceChildren(node, newChildren) : null;
            });
        } else {
            // return new node with new children immediately
            return (!bucket) ? replaceChildren(node, newChildren) : null;
        }
    }
}

/**
 * Harvest HTML and text nodes from an array
 *
 * @param  {Array<VNode>} node
 * @param  {Array<Object>} contexts
 * @param  {undefined|Array} bucket
 *
 * @return {Array|Promise<Array>}
 */
function harvestNodes(nodes, contexts, bucket) {
    var changed = false;
    var asyncRenderingRequired = false;
    var newNodes = nodes.map(function(element) {
        var harvested;
        if (element instanceof Array) {
            harvested = harvestNodes(element, contexts, bucket);
        } else {
            harvested = harvestNode(element, contexts, bucket);
        }
        if (isPromise(harvested)) {
            asyncRenderingRequired = true;
        }
        if (harvested !== element) {
            changed = true;
        }
        return harvested;
    });
    if (asyncRenderingRequired) {
        // wait for promises to resolve
        return Promise.all(newNodes);
    } else {
        // return original list if nothing has changed
        return changed ? newNodes : nodes;
    }
}

/**
 * Create an instance of a component and call its render method
 *
 * @param  {Function} type
 * @param  {Object} props
 * @param  {Array<Object>} contexts
 *
 * @return {VNode|Promise<VNode>}
 */
function renderComponent(type, props, contexts) {
    if (type.prototype && type.prototype.render instanceof Function) {
        // class-based component
        return renderClassComponent(type, props, contexts);
    } else {
        // hook-based component
        return renderHookComponent(type, props, contexts);
    }
}

/**
 * Create an instance of a class component and call its render method
 *
 * @param  {Function} componentClass
 * @param  {Object} props
 * @param  {Object} contexts
 *
 * @return {VNode|Promise<VNode>}
 */
function renderClassComponent(cls, props, contexts) {
    var component = new cls(props);
    component.props = props;
    var state = component.state;
    if (cls.getDerivedStateFromProps) {
        var originalState = state;
        var derivedState = cls.getDerivedStateFromProps(props, originalState);
        state = {};
        assign(state, originalState);
        assign(state, derivedState);
        component.state = state;
    } else if (component.componentWillMount) {
        component.componentWillMount();
        state = component.state;
    } else if (component.UNSAFE_componentWillMount) {
        component.UNSAFE_componentWillMount();
        state = component.state;
    }
    if (isAsyncComponent(component)) {
        return component.renderAsyncEx();
    } else {
        return component.render(props, state);
    }
}

/**
 * Render a functional component
 *
 * @param  {Function} func
 * @param  {Object} props
 * @param  {Array<Object>} contexts
 *
 * @return {VNode|Promise<VNode>}
 */
function renderHookComponent(func, props, contexts) {
    return func(props);
}

/**
 * Return a new node if children are different
 *
 * @param  {VNode} node
 * @param  {Array} newChildren
 *
 * @return {VNode}
 */
function replaceChildren(node, newChildren) {
    return Preact.cloneElement(node, undefined, newChildren);
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
 * @param  {VNode} node
 *
 * @return {String|Function}
 */
function getNodeType(node) {
    return node.nodeName;
}

/**
 * Return the props of a node
 *
 * @param  {VNode} node
 * @param  {Function} type
 *
 * @return {Object}
 */
function getNodeProps(node, type) {
	var props = assign({}, node.attributes);
    Object.defineProperty(props, 'children', { value: node.children });

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
 * @param  {VNode} node
 *
 * @return {*}
 */
function getNodeChildren(node) {
    return node.children;
}

/**
 * Return true if the given component is an AsyncComponent
 *
 * @param  {Object}  component
 *
 * @return {Boolean}
 */
function isAsyncComponent(component) {
    return (component.relaks && component.renderAsync instanceof Function);
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

export {
	harvest
};
