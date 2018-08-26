import Promise from 'bluebird';
import { expect, default as Chai } from 'chai';
import ChaiAsPromised from 'chai-as-promised';
import { h, Component } from 'preact'
import { renderToString } from 'preact-render-to-string';
import { shallow } from 'preact-render-spy';
import { AsyncComponent } from 'relaks/preact';
import Echo from './lib/echo';
import { harvest } from '../preact';

Chai.use(ChaiAsPromised);

/** @jsx h */

class SyncTestComponent extends Component {
    render(props) {
        return (
            <div className="test">
                <section>
                    <h1>Test</h1>
                    {props.children}
                </section>
            </div>
        );
    }
}

class AsyncTestComponent extends AsyncComponent {
    renderAsync(meanwhile, props) {
        meanwhile.show(<div>Loading...</div>, 'initial');
        return props.echo.return('data', { test:1 }, 100).then(() => {
            return (
                <SyncTestComponent>
                    {props.children}
                </SyncTestComponent>
            );
        });
    }
}

class SyncComponentReturningAsync extends Component {
    render(props) {
        return (
            <AsyncTestComponent echo={props.echo}>
                {props.children}
            </AsyncTestComponent>
        );
    }
}

function StatelessComponent(props) {
    return (
        <div className="stateless">
            {props.children}
        </div>
    );
}

function StatelessComponentReturningAsync(props) {
    return (
        <AsyncTestComponent echo={props.echo}>
            {props.children}
        </AsyncTestComponent>
    );
}

class BrokenSyncComponent extends Component {
    render() {
        return <div>{this.variable.is.missing}</div>;
    }
}

class BrokenAsyncComponent extends AsyncComponent {
    renderAsync(meanwhile, props) {
        meanwhile.show(<div>Loading...</div>, 'initial');
        return props.echo.return('data', { test:1 }, 100).then(() => {
            return (
                <BrokenSyncComponent>
                    {props.children}
                </BrokenSyncComponent>
            );
        });
    }
}

class ComponentWatchingForMount extends Component {
    constructor(props) {
        super(props);
        this.state = {
            mounted: 'No'
        };
    }

    componentWillMount() {
        this.setState({
            mounted: 'Yes'
        });
    }

    render(props, state) {
        return <div>{state.mounted}</div>;
    }
}

class ComponentWithDerivedState extends Component {
    constructor(props) {
        super(props);
        this.state = { cool: 'No' };
    }

    static getDerivedStateFromProps(props, state) {
        return { cool: 'Yes' };
    }

    render(props, state) {
        return <div>{state.cool}</div>;
    }
}

function stringify(element) {
    return renderToString(element);
}

describe('Preact test', function() {
    describe('#harvest()', function() {
        it ('should return a promise ', function() {
            var promise = harvest(null);
            expect(promise).to.have.property('then').that.is.a.function;
        })
        it ('should return scalars when given scalars', function() {
            var promises = [
                harvest(null),
                harvest('string'),
                harvest(false),
            ];
            return Promise.all(promises).then((harvested) => {
                expect(harvested[0]).to.be.null,
                expect(harvested[1]).to.be.a.string,
                expect(harvested[2]).to.be.false
            });
        })
        it ('should return the same synchronous element', function() {
            var element = <div>Hi!</div>;
            return harvest(element).then((harvested) => {
                expect(harvested).to.equal(element);
            });
        })
        it ('should handle correctly stateless components', function() {
            var contents = <h3>Hi!</h3>;
            var element = <StatelessComponent>{contents}</StatelessComponent>;
            return harvest(element).then((harvested) => {
                var context = shallow(harvested);
                expect(context.contains(contents)).to.be.true;
            });
        })
        it ('should call componentWillMount()', function() {
            var element = (
                <div>
                    <ComponentWatchingForMount />
                </div>
            );
            return harvest(element).then((harvested) => {
                var context = shallow(harvested);
                expect(context.text()).to.be.equal('Yes');
            });
        })
        it ('should call getDerivedStateFromProps()', function() {
            var element = (
                <div>
                    <ComponentWithDerivedState />
                </div>
            );
            return harvest(element).then((harvested) => {
                var context = shallow(harvested);
                expect(context.text()).to.be.equal('Yes');
            });
        })
        it ('should return an element that yield the same string as the sychronous version', function() {
            var echo = new Echo();
            var garbage = (
                <div>
                    <h1>I'm teapot</h1>
                    {null}
                    {undefined}
                    {false}
                    <em>{3}</em>
                </div>
            );
            var syncElement = <SyncTestComponent>{garbage}</SyncTestComponent>;
            var asyncElement = <AsyncTestComponent echo={echo}>{garbage}</AsyncTestComponent>;
            return harvest(asyncElement).then((harvested) => {
                var syncHTML = stringify(syncElement);
                var asyncHTML = stringify(harvested);
                expect(asyncHTML).to.equal(syncHTML);

                var context = shallow(harvested);
                expect(context.contains(garbage)).to.be.true;
            });
        })
        it ('should handle scenario where an sync component returns an async one', function() {
            var echo = new Echo();
            var garbage = (
                <div>
                    <h1>I'm teapot</h1>
                    {'Australia: '}
                    <ol>
                        {[
                            <li key={1}>dingo</li>,
                            <li key={2}>emu</li>,
                            <li key={3}>kangaroo</li>
                        ]}
                    </ol>
                </div>
            );
            var syncElement = <SyncTestComponent>{garbage}</SyncTestComponent>;
            var asyncElement = <SyncComponentReturningAsync echo={echo}>{garbage}</SyncComponentReturningAsync>;
            return harvest(asyncElement).then((harvested) => {
                var syncHTML = stringify(syncElement);
                var asyncHTML = stringify(harvested);
                expect(asyncHTML).to.equal(syncHTML);

                var context = shallow(harvested);
                expect(context.contains(garbage)).to.be.true;
            });
        })
        it ('should handle scenario where an stateless component returns an async one', function() {
            var echo = new Echo();
            var garbage = (
                <div>
                    <h1>I'm teapot</h1>
                    {'Australia: '}
                    <ol>
                        {[
                            <li key={1}>dingo</li>,
                            <li key={2}>emu</li>,
                            <li key={3}>kangaroo</li>
                        ]}
                    </ol>
                </div>
            );
            var syncElement = <SyncTestComponent>{garbage}</SyncTestComponent>;
            var asyncElement = <StatelessComponentReturningAsync echo={echo}>{garbage}</StatelessComponentReturningAsync>;
            return harvest(asyncElement).then((harvested) => {
                var syncHTML = stringify(syncElement);
                var asyncHTML = stringify(harvested);
                expect(asyncHTML).to.equal(syncHTML);

                var context = shallow(harvested);
                expect(context.contains(garbage)).to.be.true;
            });
        })
        it ('should handle async components at various places', function() {
            var echo = new Echo();
            var garbage1 = (
                <div>Hello world</div>
            );
            var garbage2 = <div>{99} bottles of beer</div>;
            var syncElement = (
                <div>
                    <SyncTestComponent>{garbage1}</SyncTestComponent>
                    <div>
                        <blockquote>
                            <SyncTestComponent>{garbage2}</SyncTestComponent>
                        </blockquote>
                    </div>
                    [
                        <SyncTestComponent key={1} />,
                        <SyncTestComponent key={2} />,
                        null,
                        <SyncTestComponent key={3} />,
                    ]
                </div>
            );
            var asyncElement = (
                <div>
                    <AsyncTestComponent echo={echo}>{garbage1}</AsyncTestComponent>
                    <div>
                        <blockquote>
                            <AsyncTestComponent echo={echo}>{garbage2}</AsyncTestComponent>
                        </blockquote>
                    </div>
                    [
                        <AsyncTestComponent echo={echo} key={1} />,
                        <AsyncTestComponent echo={echo} key={2} />,
                        null,
                        <AsyncTestComponent echo={echo} key={3} />,
                    ]
                </div>
            );
            return harvest(asyncElement).then((harvested) => {
                var syncHTML = stringify(syncElement);
                var asyncHTML = stringify(harvested);
                expect(asyncHTML).to.equal(syncHTML);
            });
        })
        it ('should returns a promise that rejects when a sync component is broken', function() {
            var element = <BrokenSyncComponent />;
            return expect(harvest(element)).to.eventually.be.rejected;
        })
        it ('should returns a promise that rejects when an async component is broken', function() {
            var element = <BrokenAsyncComponent />;
            return expect(harvest(element)).to.eventually.be.rejected;
        })
    })
});
