import React from 'react';

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

function renderHookComponent(func, props, context) {
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
            ReactCurrentDispatcher.current = Dispatcher;
            if (func.renderAsyncEx) {
                rendered = func.renderAsyncEx(props, context);
            } else {
                rendered = func(props, context);
            }
        } finally {
            ReactCurrentDispatcher.current = prevDispatcher;
        }
    } else {
        rendered = func(props, context);
    }
    return rendered;
}

export { 
    renderHookComponent, 
};
