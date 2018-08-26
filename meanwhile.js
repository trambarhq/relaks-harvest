function Meanwhile(component, previously) {
    var relaks = component.relaks;
    this.component = component;
    this.synchronous = false;
    this.showingProgress = false;
    this.showingProgressInitially = false;
    this.delayWhenEmpty = Infinity;
    this.delayWhenRendered = Infinity;
    this.canceled = false;
    this.prior = relaks.previous;
    this.previous = relaks.previous;
    this.current = relaks.current;
    this.updateTimeout = 0;
    this.startTime = getTime();
    this.onCancel = null;
    this.onComplete = null;
    this.onProgress = null;
}

var prototype = Meanwhile.prototype;

prototype.check = function() {
}

prototype.show = function(element, disposition) {
    return false;
};

prototype.revising = function() {
    return false;
};

prototype.delay = function(empty, rendered) {
};

prototype.update = function(forced) {
};

prototype.cancel = function() {
};

prototype.finish = function() {
};

prototype.clear = function() {
};

var scriptStartTime = new Date;

/**
 * Return the number of milliseconds passed since start of this script
 *
 * @return {Number}
 */
function getTime() {
    return (new Date) - scriptStartTime;
}

module.exports = prototype.constructor;
