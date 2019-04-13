import React from 'react';

/**
 * Harvest HTML and text nodes
 *
 * @param  {ReactElement} node
 * @param  {Object|undefined} options
 *
 * @return {Promise<ReactElement>}
 */
function harvest(node, options) {
    try {
        // see if we're collecting seeds
        var bucket = (options && options.seeds) ? [] : null;
        var harvested = harvestNode(node, [], bucket);
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
 * @param  {ReactElement} node
 * @param  {Array} contexts
 * @param  {undefined|Array}
 *
 * @return {ReactElement|Array|null|Promise<ReactElement|null>}
 */
function harvestNode(node, contexts, bucket) {
    if (!(node instanceof Object)) {
		return (!bucket) ? node : null;
	}
    var type = getNodeType(node);
    if (!type) {
        return;
    }
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
            return harvestNodes(rendered, contexts, bucket);
        }
    } else if (type.provider) {
        // context provider
        var props = getNodeProps(node, type);
        var children = getNodeChildren(node);
        contexts.push(type);
        var newChildren = harvestNodes(children, contexts, bucket);
        contexts.pop();
        return newChildren;
    } else if (type.consumer) {
        if (type.func instanceof Function) {
            var context = getContext(contexts, type.consumer);
            var children = type.func(context);
            return harvestNodes(children, contexts, bucket);
        } else {
            return null;
        }
    } else {
        // harvest HTML+text nodes from children
        var children = getNodeChildren(node);
        var newChildren = harvestNodes(children, contexts, bucket);
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
 * @param  {Array<ReactElement>} node
 * @param  {Object} contexts
 * @param  {undefined|Array} bucket
 *
 * @return {Array|Promise<Array>}
 */
function harvestNodes(nodes, contexts, bucket) {
    if (!(nodes instanceof Array)) {
        return harvestNode(nodes, contexts, bucket);
    }
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
 * Render a component
 *
 * @param  {Function} type
 * @param  {Object} props
 * @param  {Array<Object>} contexts
 *
 * @return {ReactElement|Promise<ReactElement>}
 */
function renderComponent(type, props, contexts) {
    var rendered;
    if (type.prototype && type.prototype.render instanceof Function) {
        // class based component
        rendered = renderClassComponent(type, props, contexts);
    } else {
        // hook-based component
        rendered = renderHookComponent(type, props, contexts);
    }
    return rendered;
}

/**
 * Create an instance of a class component and call its render method
 *
 * @param  {Function} componentClass
 * @param  {Object} props
 * @param  {Object} contexts
 *
 * @return {ReactElement|Promise<ReactElement>}
 */
function renderClassComponent(cls, props, contexts) {
    var component = new cls(props);
    component.props = props;
    component.context = getContext(contexts, cls.contextType);
    var state = component.state;
    if (cls.getDerivedStateFromProps) {
        var originalState = state;
        var derivedState = cls.getDerivedStateFromProps(props, originalState);
        state = {};
        assign(state, originalState);
        assign(state, derivedState);
        component.state = state;
    } else if (component.componentWillMount) {
        component.updater = ReactUpdater;
        component.componentWillMount();
        state = component.state;
    } else if (component.UNSAFE_componentWillMount) {
        component.updater = ReactUpdater;
        component.UNSAFE_componentWillMount();
        state = component.state;
    }
    if (isAsyncComponent(component)) {
        return component.renderAsyncEx();
    } else {
        return component.render();
    }
}

/**
 * Render a functional component
 *
 * @param  {Function} func
 * @param  {Object} props
 * @param  {Array<Object>} contexts
 *
 * @return {ReactElement|Promise<ReactElement>}
 */
function renderHookComponent(func, props, contexts) {
    var ReactCurrentDispatcher;
    for (var name in React) {
        var value = React[name];
        if (value instanceof Object) {
            if (value.ReactCurrentDispatcher) {
                ReactCurrentDispatcher = value.ReactCurrentDispatcher;
            }
        }
    }

    var rendered;
    if (ReactCurrentDispatcher) {
        try {
            var prevDispatcher= ReactCurrentDispatcher.current;
            ReactCurrentDispatcher.current = {
            	useState: function(initial) {
                	var set = function(v) {};
                	return [ initial, set ];
                },
            	useEffect: function(f) {
                },
            	useRef: function() {
                    var set = function(v) {};
                    return set;
                },
            	useMemo: function(f) {
                	return f();
                },
                useCallback: function(f) {
                    return f;
                },
                useContext: function(type) {
                    return getContext(contexts, type);
                },
            };
            if (func.renderAsyncEx) {
                rendered = func.renderAsyncEx(props);
            } else {
                var context = getContext(contexts, func.contextType);
                rendered = func(props, context);
            }
        } finally {
            ReactCurrentDispatcher.current = prevDispatcher;
        }
    } else {
        var context = getContext(contexts, func.contextType);
        rendered = func(props, context);
    }
    return rendered;
}

/**
 * Return a new node if children are different
 *
 * @param  {ReactElement} node
 * @param  {Array} newChildren
 *
 * @return {ReactElement}
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
 * @param  {ReactElement} node
 *
 * @return {String|Function}
 */
function getNodeType(node) {
    var type = node.type;
    if (type instanceof Object) {
        if (type.$$typeof === Symbol.for('react.memo')) {
            type = type.type;
        } else if (type.$$typeof === Symbol.for('react.provider')) {
            type = {
                provider: type,
                value: node.props.value,
            };
        } else if (type.$$typeof === Symbol.for('react.context')) {
            type = {
                consumer: type,
                func: node.props.children,
            };
        }
    }
    return type;
}

/**
 * Look for a context
 *
 * @param  {Array<Object>} contexts
 * @param  {Object} contextType
 *
 * @return {*}
 */
function getContext(contexts, contextType) {
    if (contextType) {
        for (var i = contexts.length - 1; i >= 0; i--) {
            var context = contexts[i];
            if (context.provider._context === contextType) {
                return context.value;
            }
        }
        return contextType._currentValue;
    }
}

/**
 * Return the props of a node
 *
 * @param  {ReactElement} node
 * @param  {Function} type
 *
 * @return {Object}
 */
function getNodeProps(node, type) {
	var props = assign({}, node.props);
    Object.defineProperty(props, 'children', { value: node.props.children });

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
 * @param  {ReactElement} node
 *
 * @return {*}
 */
function getNodeChildren(node) {
    if (node.props) {
        return node.props.children;
    }
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

export {
	harvest
};
