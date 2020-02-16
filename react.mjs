import React from 'react';

function _defineProperty(obj, key, value) {
  if (key in obj) {
    Object.defineProperty(obj, key, {
      value: value,
      enumerable: true,
      configurable: true,
      writable: true
    });
  } else {
    obj[key] = value;
  }

  return obj;
}

function ownKeys(object, enumerableOnly) {
  var keys = Object.keys(object);

  if (Object.getOwnPropertySymbols) {
    var symbols = Object.getOwnPropertySymbols(object);
    if (enumerableOnly) symbols = symbols.filter(function (sym) {
      return Object.getOwnPropertyDescriptor(object, sym).enumerable;
    });
    keys.push.apply(keys, symbols);
  }

  return keys;
}

function _objectSpread2(target) {
  for (var i = 1; i < arguments.length; i++) {
    var source = arguments[i] != null ? arguments[i] : {};

    if (i % 2) {
      ownKeys(Object(source), true).forEach(function (key) {
        _defineProperty(target, key, source[key]);
      });
    } else if (Object.getOwnPropertyDescriptors) {
      Object.defineProperties(target, Object.getOwnPropertyDescriptors(source));
    } else {
      ownKeys(Object(source)).forEach(function (key) {
        Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key));
      });
    }
  }

  return target;
}

var ReactMemo = Symbol["for"]('react.memo');
var ReactProvider = Symbol["for"]('react.provider');
var ReactContext = Symbol["for"]('react.context');
var harvestFlag = false;
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
  var bucket = options && options.seeds ? [] : null;
  var harvested;

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

  return harvested.then(function (result) {
    harvestFlag = false;
    return bucket ? bucket : result;
  })["catch"](function (err) {
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
    return !bucket ? node : null;
  }

  var type = getNodeType(node);

  if (!type) {
    return null;
  }

  if (type instanceof Function) {
    // it's a component
    var props = getNodeProps(node, type);
    var rendered = renderComponent(type, props, contexts);

    if (isPromise(rendered)) {
      // wait for asynchronous rendering to finish
      return rendered.then(function (rendered) {
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
    var _props = getNodeProps(node, type);

    var contextType = getNodeContextType(node);
    var children = getNodeChildren(node);
    contexts = contexts.slice();
    contexts.push({
      type: contextType,
      value: _props.value
    });
    return harvestNodes(children, contexts, bucket);
  } else if (type === ReactContext) {
    var func = getNodeChildren(node);

    if (func instanceof Function) {
      var _contextType = getNodeContextType(node);

      var context = getContext(contexts, _contextType);

      var _children = func(context);

      return harvestNodes(_children, contexts, bucket);
    } else {
      return null;
    }
  } else {
    // harvest HTML+text nodes from children
    var _children2 = getNodeChildren(node);

    var newChildren = harvestNodes(_children2, contexts, bucket);

    if (newChildren === _children2) {
      // no change
      return !bucket ? node : null;
    }

    if (isPromise(newChildren)) {
      // wait for asynchrounous rendering of children
      return newChildren.then(function (newChildren) {
        return !bucket ? replaceChildren(node, newChildren) : null;
      });
    } else {
      // return new node with new children immediately
      return !bucket ? replaceChildren(node, newChildren) : null;
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
  var newNodes = nodes.map(function (element) {
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
  var component = new cls(props);
  component.props = props;
  component.context = getContext(contexts, cls.contextType);

  if (cls.getDerivedStateFromProps) {
    var originalState = component.state;
    var derivedState = cls.getDerivedStateFromProps(props, originalState);
    component.state = _objectSpread2({}, originalState, {}, derivedState);
  } else if (component.componentWillMount) {
    component.updater = ReactUpdater;
    component.componentWillMount();
  } else if (component.UNSAFE_componentWillMount) {
    component.updater = ReactUpdater;
    component.UNSAFE_componentWillMount();
  }

  var rendered;

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
  var rendered;
  var ReactCurrentDispatcher = getDispatcherRef();

  if (ReactCurrentDispatcher) {
    var prevDispatcher = ReactCurrentDispatcher.current;

    try {
      ReactCurrentDispatcher.current = {
        useState: function useState(initial) {
          var set = function set(v) {};

          return [initial, set];
        },
        useEffect: function useEffect(f) {},
        useContext: function useContext(type) {
          return getContext(contexts, type);
        },
        useReducer: function useReducer(reducer, initial, f) {
          if (f) {
            return f(initial);
          } else {
            return initial;
          }
        },
        useCallback: function useCallback(f) {
          return f;
        },
        useMemo: function useMemo(f) {
          return f();
        },
        useRef: function useRef(initial) {
          var set = function set(v) {
            set.current = v;
          };

          set.current = initial;
          return set;
        },
        useImperativeHandle: function useImperativeHandle() {},
        useLayoutEffect: function useLayoutEffect(f) {},
        useDebugValue: function useDebugValue() {}
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
    var _context = getContext(contexts, func.contextType);

    rendered = func(props, _context);
  }

  return rendered;
}

var dispatcherRef;
/**
 * Look for React internal state 'ReactCurrentDispatcher'
 *
 * @return {Object}
 */

function getDispatcherRef() {
  if (dispatcherRef === undefined) {
    dispatcherRef = null;

    for (var name in React) {
      var value = React[name];

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
  var type = node.type;

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
  var type = node.type;

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
    for (var i = contexts.length - 1; i >= 0; i--) {
      var context = contexts[i];

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
  var props = _objectSpread2({}, node.props);

  Object.defineProperty(props, 'children', {
    value: node.props.children
  }); // apply default props

  for (var name in type.defaultProps) {
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
  return component.relaks && component.renderAsync instanceof Function;
}
/**
 * Return true if given value hold a promise
 *
 * @param  {*}  value
 *
 * @return {Boolean}
 */


function isPromise(value) {
  return value instanceof Object && value.then instanceof Function;
}

var ReactUpdater = {
  enqueueCallback: function enqueueCallback(inst, f) {
    f();
  },
  enqueueForceUpdate: function enqueueForceUpdate(inst) {},
  enqueueReplaceState: function enqueueReplaceState(inst, state) {
    inst.state = _objectSpread2({}, inst, {}, state);
  },
  enqueueSetState: function enqueueSetState(inst, partialState) {
    inst.state = _objectSpread2({}, inst.state, {}, partialState);
  },
  isMounted: function isMounted() {
    return true;
  }
};

export { harvest, harvesting };
