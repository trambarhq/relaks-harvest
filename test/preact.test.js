import Bluebird from 'bluebird';
import Chai, { expect } from 'chai';
import ChaiAsPromised from 'chai-as-promised';
import { h, Component } from 'preact'
import { renderToString } from 'preact-render-to-string';
import Enzyme, { shallow, mount } from 'enzyme';
import Adapter from 'enzyme-adapter-preact-pure';
import { AsyncComponent } from 'relaks/preact';
import { harvest } from '../preact.mjs';

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
  async renderAsync(meanwhile, props) {
    meanwhile.show(<div>Loading...</div>, 'initial');
    await Bluebird.delay(100);
    return (
      <SyncTestComponent>
        {props.children}
      </SyncTestComponent>
    );
  }
}

class SyncComponentReturningAsync extends Component {
  render(props) {
    return (
      <AsyncTestComponent>
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
    <AsyncTestComponent>
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
  async renderAsync(meanwhile, props) {
    meanwhile.show(<div>Loading...</div>, 'initial');
    await Bluebird.delay(100);
    return (
      <BrokenSyncComponent>
        {props.children}
      </BrokenSyncComponent>
    );
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
  beforeEach(function() {
    Enzyme.configure({ adapter: new Adapter() });
  })
  describe('#harvest()', function() {
    it ('should return a promise ', function() {
      const promise = harvest(null);
      expect(promise).to.have.property('then').that.is.a('function');
    })
    it ('should return scalars when given scalars', async function() {
      const promises = [
        harvest(null),
        harvest('string'),
        harvest(false),
      ];
      const harvested = await Promise.all(promises);
      expect(harvested[0]).to.be.null,
      expect(harvested[1]).to.be.a.string,
      expect(harvested[2]).to.be.false
    })
    it ('should return the same synchronous element', async function() {
      const element = <div>Hi!</div>;
      const harvested = await harvest(element);
      expect(harvested).to.equal(element);
    })
    it ('should handle correctly stateless components', async function() {
      const contents = <h3>Hi!</h3>;
      const element = <StatelessComponent>{contents}</StatelessComponent>;
      const harvested = await harvest(element);
      const context = shallow(harvested);
      expect(context.contains(contents)).to.be.true;
    })
    it ('should call componentWillMount()', async function() {
      const element = (
        <div>
          <ComponentWatchingForMount />
        </div>
      );
      const harvested = await harvest(element);
      const context = shallow(harvested);
      expect(context.text()).to.be.equal('Yes');
    })
    it ('should call getDerivedStateFromProps()', async function() {
      const element = (
        <div>
          <ComponentWithDerivedState />
        </div>
      );
      const harvested = await harvest(element);
      const context = shallow(harvested);
      expect(context.text()).to.be.equal('Yes');
    })
    it ('should return an element that yield the same string as the sychronous version', async function() {
      const garbage = (
        <div>
          <h1>I'm teapot</h1>
          {null}
          {undefined}
          {false}
          <em>{3}</em>
        </div>
      );
      const syncElement = <SyncTestComponent>{garbage}</SyncTestComponent>;
      const asyncElement = <AsyncTestComponent>{garbage}</AsyncTestComponent>;
      const harvested = await harvest(asyncElement);
      const syncHTML = stringify(syncElement);
      const asyncHTML = stringify(harvested);
      expect(asyncHTML).to.equal(syncHTML);
    })
    it ('should handle scenario where an sync component returns an async one', async function() {
      const garbage = (
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
      const syncElement = <SyncTestComponent>{garbage}</SyncTestComponent>;
      const asyncElement = <SyncComponentReturningAsync>{garbage}</SyncComponentReturningAsync>;
      const harvested = await harvest(asyncElement);
      const syncHTML = stringify(syncElement);
      const asyncHTML = stringify(harvested);
      expect(asyncHTML).to.equal(syncHTML);

      const context = shallow(harvested);
      expect(context.contains(garbage)).to.be.true;
    })
    it ('should handle scenario where an stateless component returns an async one', async function() {
      const garbage = (
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
      const syncElement = <SyncTestComponent>{garbage}</SyncTestComponent>;
      const asyncElement = <StatelessComponentReturningAsync>{garbage}</StatelessComponentReturningAsync>;
      const harvested = await harvest(asyncElement);
      const syncHTML = stringify(syncElement);
      const asyncHTML = stringify(harvested);
      expect(asyncHTML).to.equal(syncHTML);

      const context = shallow(harvested);
      expect(context.contains(garbage)).to.be.true;
    })
    it ('should handle async components at various places', async function() {
      const garbage1 = (
        <div>Hello world</div>
      );
      const garbage2 = <div>{99} bottles of beer</div>;
      const syncElement = (
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
      const asyncElement = (
        <div>
          <AsyncTestComponent>{garbage1}</AsyncTestComponent>
          <div>
            <blockquote>
              <AsyncTestComponent>{garbage2}</AsyncTestComponent>
            </blockquote>
          </div>
          [
            <AsyncTestComponent key={1} />,
            <AsyncTestComponent key={2} />,
            null,
            <AsyncTestComponent key={3} />,
          ]
        </div>
      );
      const harvested = await harvest(asyncElement);
      const syncHTML = stringify(syncElement);
      const asyncHTML = stringify(harvested);
      expect(asyncHTML).to.equal(syncHTML);
    })
    it ('should returns a promise that rejects when a sync component is broken', function() {
      const element = <BrokenSyncComponent />;
      return expect(harvest(element)).to.eventually.be.rejected;
    })
    it ('should returns a promise that rejects when an async component is broken', function() {
      const element = <BrokenAsyncComponent />;
      return expect(harvest(element)).to.eventually.be.rejected;
    })
    it ('should collect rendering of async elements', async function() {
      const garbage = (
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
      const syncElement = <SyncTestComponent>{garbage}</SyncTestComponent>;
      const asyncElement = <SyncComponentReturningAsync>{garbage}</SyncComponentReturningAsync>;
      const harvested = await harvest(asyncElement, { seeds: true });
      expect(harvested).to.be.an('array').that.has.lengthOf(1);

      const entry = harvested[0];
      expect(entry).to.have.property('type', AsyncTestComponent);
      expect(entry).to.have.property('props');
      expect(entry).to.have.property('result');

      const syncHTML = stringify(syncElement);
      const asyncHTML = stringify(entry.result);
      expect(asyncHTML).to.equal(syncHTML);
    })
  })
});
