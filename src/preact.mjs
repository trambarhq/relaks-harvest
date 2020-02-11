import Preact from 'preact';

let harvestFlag = false;

/**
 * Harvest HTML and text nodes
 *
 * @param  {VNode} node
 * @param  {Object|undefined} options
 *
 * @return {Promise<Vnode>}
 */
function harvest(node, options) {
  // see if we're collecting seeds
  const bucket = (options && options.seeds) ? [] : null;
  let harvested;
  try {
    harvestFlag = true;
    harvested = harvestNode(node, {}, bucket);
    if (!isPromise(harvested)) {
      // always return a promise
      harvested = Promise.resolve(harvested);
    }
  } catch (err) {
    harvested =  Promise.reject(err);
  }
  return harvested.then(function(result) {
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
  const type = getNodeType(node);
  if (type instanceof Function) {
    // it's a component
    const props = getNodeProps(node, type);
    const rendered = renderComponent(type, props, contexts);
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
    const children = getNodeChildren(node);
    let newChildren;
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
  const component = new cls(props);
  component.props = props;
  if (cls.getDerivedStateFromProps) {
    const originalState = component.state;
    const derivedState = cls.getDerivedStateFromProps(props, originalState);
    component.state = { ...originalState, ...derivedState };
  } else if (component.componentWillMount) {
    component.componentWillMount();
  } else if (component.UNSAFE_componentWillMount) {
    component.UNSAFE_componentWillMount();
  }
  if (isAsyncComponent(component)) {
    return component.renderAsyncEx(props, component.state);
  } else {
    return component.render(props, component.state);
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
 * Return a node's type
 *
 * @param  {VNode} node
 *
 * @return {String|Function}
 */
function getNodeType(node) {
  if (node.nodeName) {
    return node.nodeName;
  }
  if (node.type) {
    return node.type;
  }
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
	let props;
  if (node.attributes) {
    props = { ...node.attributes };
    Object.defineProperty(props, 'children', { value: node.children });
  } else {
    props = { ...node.props };
  }

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
 * @param  {VNode} node
 *
 * @return {*}
 */
function getNodeChildren(node) {
  if (node.children) {
    return node.children;
  }
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

export {
	harvest,
  harvesting,
};
