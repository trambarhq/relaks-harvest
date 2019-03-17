module.exports = function(React) {

	var ReactCurrentDispatcher;
    for (var name in React) {
        var value = React[name];
        if (value instanceof Object) {
            if (value.ReactCurrentDispatcher) {
                ReactCurrentDispatcher = value.ReactCurrentDispatcher;
            }
        }
    }

    if (!ReactCurrentDispatcher) {
    	return null;
    }

    var Dispatcher = {
    	useState: useState,
    	useEffect: useEffect,
    	useRef: useRef,
    	useMemo: useMemo,
    };

    function useState(initialState) {
    	var set = (v) => {};
    	return [ initialState, set ];
    }

    function useMemo(f) {
    	return f();
    }

    function useEffect() {
    }

    function useRef() {

    }

    function renderComponent(func, props) {
        var rendered;
        try {
	        var prevDispatcher= ReactCurrentDispatcher.current;        
	        ReactCurrentDispatcher.current = Dispatcher;
        	if (func.renderAsync) {
        		rendered = func.renderAsync(props);
        	} else {
	            rendered = func(props);
        	}
        } finally {
            ReactCurrentDispatcher.current = prevDispatcher;
        }
        return rendered;
    }

    return { renderComponent: renderComponent };
};