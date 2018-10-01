# relaks-harvest

Relaks-harvest enables server-side rendering (SSR) of a React application
that uses [Relaks](https://github.com/chung-leong/relaks). It takes a
ReactElement (or Preact VNode) and recursively renders all sub-components.
When it encounters a Relaks component, it calls renderAsync() and waits for
the returned promise to fulfill. The end result is a tree of ReactElements (or
VNodes) that are are all simple HTML tags, which can then be given to
[ReactDOMServer.renderToString()](https://reactjs.org/docs/react-dom-server.html#rendertostring)
(or [preact-render-to-string](https://github.com/developit/preact-render-to-string)).

Relaks-harvest is designed to run on both the server-side and the client-side.
On the server-side, it's used to generate the HTML that a visitor will see
initially. On the client-side, it's used to trigger pre-caching of data prior to
a switch to client-side rendering (while the visitor is looking at the
server-generated contents). Provided that the same code is used for in both
situations, the state of the client will sync up correctly, yielding a
completely seamless transition from SSR to CSR.

For an example on how to use relaks-harvest, please look at
[relaks-starwars-example-isomorphic](https://github.com/chung-leong/relaks-starwars-example-isomorphic).

## Install

```sh
npm --save-dev install relaks-harvest
```

## Usage

React:

```js
import { harvest } from 'relaks-harvest';
import { renderToString } from 'react-dom/server';

let appElement = <Application />;
let appHTMLElement = async harvest(appElement);
let appHTML = ReactDOMServer.renderToString(appHTMLElement);
```

Preact:

```js
import { harvest } from 'relaks-harvest/preact';
import { render } from 'preact-render-to-string';

let appElement = <Application />;
let appHTMLElement = async harvest(appElement);
let appHTML = render(appHTMLElement);
```

In an real-world implementation, you'll likely return the element from
your client-side code and perform the conversion to HTML in your server-side
code, in order to avoid importing code that would only run on the server-side.
