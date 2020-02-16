import React from 'react';

const ReactMemo = Symbol.for('react.memo');
const ReactProvider = Symbol.for('react.provider');
const ReactContext = Symbol.for('react.context');

let harvestFlag = false;

/**
 * Harvest HTML and text nodes
 *
 * @param  {ReactElement} node
 * @param  {Object|undefined} options
 *
 * @return {Promise<ReactElement>}
 */
function harvest(node, options) {
  // see if we're collecting seeds
  const bucket = (options && options.seeds) ? [] : null;
  let harvested;
  try {
    harvestFlag = true;
    harvested = harvestNode(node, [], bucket);
    if (!isPromise(harvested)) {
      // always return a promise
      harvested = Promise.resolve(harvested);
    }
  } catch (err) {
    harvested = Promise.reject(err);
  }
  return harvested.then((result) => {
    harvestFlag = false;
    return (bucket) ? bucket : result;
  }).catch(function(err) {
    harvestFlag = false;
    throw err;
  });
}

/**
 * Return true when we're in the middle harvesting node
 *
 * @return {Boolean}
 */
function harvesting() {
  return harvestFlag;
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
  const type = getNodeType(node);
  if (!type) {
    return null;
  }
  if (type instanceof Function) {
    // it's a component
    const props = getNodeProps(node, type);
    const rendered = renderComponent(type, props, contexts);
    if (isPromise(rendered)) {
      // wait for asynchronous rendering to finish
      return rendered.then((rendered) => {
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
  } else if (type === ReactProvider) {
    // context provider
    const props = getNodeProps(node, type);
    const contextType = getNodeContextType(node);
    const children = getNodeChildren(node);
    contexts = contexts.slice();
    contexts.push({
      type: contextType,
      value: props.value
    });
    return harvestNodes(children, contexts, bucket);
  } else if (type === ReactContext) {
    const func = getNodeChildren(node);
    if (func instanceof Function) {
      const contextType = getNodeContextType(node);
      const context = getContext(contexts, contextType);
      const children = func(context);
      return harvestNodes(children, contexts, bucket);
    } else {
      return null;
    }
  } else {
    // harvest HTML+text nodes from children
    const children = getNodeChildren(node);
    const newChildren = harvestNodes(children, contexts, bucket);
    if (newChildren === children) {
      // no change
      return (!bucket) ? node : null;
    }
    if (isPromise(newChildren)) {
      // wait for asynchrounous rendering of children
      return newChildren.then((newChildren) => {
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
  let changed = false;
  let asyncRenderingRequired = false;
  const newNodes = nodes.map(function(element) {
    let harvested;
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
  if (type.prototype && type.prototype.render instanceof Function) {
    // class based component
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
 * @return {ReactElement|Promise<ReactElement>}
 */
function renderClassComponent(cls, props, contexts) {
  const component = new cls(props);
  component.props = props;
  component.context = getContext(contexts, cls.contextType);
  if (cls.getDerivedStateFromProps) {
    const originalState = component.state;
    const derivedState = cls.getDerivedStateFromProps(props, originalState);
    component.state = { ...originalState, ...derivedState };
  } else if (component.componentWillMount) {
    component.updater = ReactUpdater;
    component.componentWillMount();
  } else if (component.UNSAFE_componentWillMount) {
    component.updater = ReactUpdater;
    component.UNSAFE_componentWillMount();
  }
  let rendered;
  if (isAsyncComponent(component)) {
    rendered = component.renderAsyncEx();
  } else {
    rendered = component.render();
  }
  return rendered;
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
  let rendered;
  const ReactCurrentDispatcher = getDispatcherRef();
  if (ReactCurrentDispatcher) {
    const prevDispatcher = ReactCurrentDispatcher.current;
    try {
      ReactCurrentDispatcher.current = {
      	useState: function(initial) {
        	const set = function(v) {};
        	return [ initial, set ];
        },
      	useEffect: function(f) {
        },
        useContext: function(type) {
          return getContext(contexts, type);
        },
        useReducer: function(reducer, initial, f) {
          if (f) {
            return f(initial);
          } else {
            return initial;
          }
        },
        useCallback: function(f) {
          return f;
        },
        useMemo: function(f) {
        	return f();
        },
        useRef: function(initial) {
          const set = function(v) {
            set.current = v;
          };
          set.current = initial;
          return set;
        },
        useImperativeHandle: function() {
        },
        useLayoutEffect: function(f) {
        },
        useDebugValue: function() {
        },
      };
      if (func.renderAsyncEx) {
        rendered = func.renderAsyncEx(props);
      } else {
        const context = getContext(contexts, func.contextType);
        rendered = func(props, context);
      }
    } finally {
      ReactCurrentDispatcher.current = prevDispatcher;
    }
  } else {
    const context = getContext(contexts, func.contextType);
    rendered = func(props, context);
  }
  return rendered;
}

let dispatcherRef;

/**
 * Look for React internal state 'ReactCurrentDispatcher'
 *
 * @return {Object}
 */
function getDispatcherRef() {
  if (dispatcherRef === undefined) {
    dispatcherRef = null;
    for (let name in React) {
      const value = React[name];
      if (value instanceof Object) {
        if (value.ReactCurrentDispatcher) {
          dispatcherRef = value.ReactCurrentDispatcher;
          break;
        }
      }
    }
  }
  return dispatcherRef;
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
  if (process.env.NODE_ENV !== 'production') {
    // prevent warning about missing keys
    newChildren = React.Children.toArray(newChildren);
  }
  return React.cloneElement(node, undefined, newChildren);
}

/**
 * Return a node's type
 *
 * @param  {ReactElement} node
 *
 * @return {String|Function}
 */
function getNodeType(node) {
  let { type } = node;
  if (type instanceof Object) {
    if (type.$$typeof === ReactMemo) {
      type = type.type;
    } else if (type.$$typeof === ReactProvider) {
      type = ReactProvider;
    } else if (type.$$typeof === ReactContext) {
      type = ReactContext;
    }
  }
  return type;
}

/**
 * Return a node's context type
 *
 * @param  {ReactElement} node
 *
 * @return {Object}
 */
function getNodeContextType(node) {
  const { type } = node;
  if (type instanceof Object) {
    return type._context;
  }
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
    for (let i = contexts.length - 1; i >= 0; i--) {
      let context = contexts[i];
      if (context.type === contextType) {
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
	const props = { ...node.props };
  Object.defineProperty(props, 'children', { value: node.props.children });

  // apply default props
  for (let name in type.defaultProps) {
    if (props[name] === undefined) {
      props[name] = type.defaultProps[name];
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

const ReactUpdater = {
  enqueueCallback: function(inst, f) {
    f();
  },
  enqueueForceUpdate: function(inst) {
  },
  enqueueReplaceState: function(inst, state) {
    inst.state = { ...inst, ...state };
  },
  enqueueSetState: function(inst, partialState) {
    inst.state = { ...inst.state, ...partialState };
  },
  isMounted: function() {
    return true;
  },
}

export {
	harvest,
  harvesting,
};
