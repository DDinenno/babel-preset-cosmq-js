const { pluginTester } = require("babel-plugin-tester");
const transformJSXPlugin = require("../transform-jsx/index");

pluginTester({
  plugin: transformJSXPlugin,
  pluginName: "transform-jsx",
  formatResult: (code) => code,
  snapshot: true,
  tests: {
    // 1. Basic JSX Elements
    "transforms basic native element": {
      code: "const el = <div>Hello World</div>;",
    },
    "transforms nested native elements and strips blank whitespace": {
      code: `
        const el = (
          <div className="container">
            <h1>Title</h1>
            <p>Description</p>
          </div>
        );
      `,
    },
    "transforms elements with self-closing tags and boolean attributes": {
      code: `const el = <input type="text" disabled required readOnly />;`,
    },

    // 2. Namespaced Event Handlers & Attributes
    "transforms handle: namespaced event handlers": {
      code: `const el = <button handle:click={handleClick} handle:input={handleInput}>Submit</button>;`,
    },
    "transforms style attribute object": {
      code: `const el = <div style={{ color: "red", marginTop: "10px" }}>Styled</div>;`,
    },

    // 3. Components
    "transforms custom component with Capitalized tag": {
      code: `const el = <CustomButton size="large" variant="primary">Click</CustomButton>;`,
    },
    "resolves component tag to local Component_ declaration": {
      code: `
        const Component_Project = ({ item }) => <div>{item}</div>;
        const el = <Project item="Cosmq" />;
      `,
    },
    "transforms component passing children to children property": {
      code: `
        const el = (
          <Card title="Overview">
            <Button>Close</Button>
          </Card>
        );
      `,
    },
    "handles function declaration for Component_": {
      code: `
        function Component_Header({ title }) {
          return <h1>{title}</h1>;
        }
      `,
    },

    // 4. ReactiveList
    "transforms ReactiveList with key, data, and render function": {
      code: `
        const el = (
          <ReactiveList data={items} key={(item) => item.id}>
            {(item, i) => (
              <li key={item.id}>
                <span>{item.name}</span>
              </li>
            )}
          </ReactiveList>
        );
      `,
    },
    "does not rewrite data observable to .value inside ReactiveList prop": {
      code: `
        const Component_TodoList = () => {
          const items = observe([]);
          return (
            <ReactiveList data={items} key={(item) => item.id}>
              {(item) => <div>{item.name}</div>}
            </ReactiveList>
          );
        };
      `,
    },

    // 5. Observable Reactivity in Components
    "wraps observable binary expression in JSX container with Cosmq.compute": {
      code: `
        const Component_Counter = () => {
          const count = observe(0);
          return <div>{count + 1}</div>;
        };
      `,
    },
    "wraps observable template literal in JSX with Cosmq.compute": {
      code: `
        const Component_Greeting = () => {
          const name = observe("World");
          return <div>{\`Hello, \${name}!\`}</div>;
        };
      `,
    },
    "wraps dynamic JSX attribute dependent on observable with Cosmq.compute": {
      code: `
        const Component_Card = () => {
          const isActive = observe(true);
          return <div className={isActive ? "active" : "inactive"}>Card</div>;
        };
      `,
    },
    "wraps logical expression in JSX container with Cosmq.compute": {
      code: `
        const Component_Gate = () => {
          const hasItems = observe(true);
          return <div>{hasItems && <span>Items available</span>}</div>;
        };
      `,
    },
    "wraps ternary expression in JSX container with Cosmq.compute": {
      code: `
        const Component_Status = () => {
          const isReady = observe(false);
          return <div>{isReady ? <span>Ready</span> : <span>Waiting</span>}</div>;
        };
      `,
    },
    "transforms reactive variable declaration containing observable to Cosmq.compute": {
      code: `
        const Component_Derived = () => {
          const count = observe(0);
          const total = count + 10;
          return <div>{total}</div>;
        };
      `,
    },

    // 6. Observable Assignment
    "transforms observable assignment to .set() method call": {
      code: `
        const Component_Counter = () => {
          const count = observe(0);
          const inc = () => {
            count = count + 1;
          };
          return <button handle:click={inc}>Increment</button>;
        };
      `,
    },

    // 7. Observable .value access in inner functions
    "transforms observable access to .value when read inside function": {
      code: `
        const Component_Viewer = () => {
          const text = observe("hello");
          const log = () => {
            console.log(text);
          };
          return <div>Viewer</div>;
        };
      `,
    },
    "does not transform observable to .value when returned directly": {
      code: `
        const Component_Raw = () => {
          const count = observe(10);
          return count;
        };
      `,
    },

    // 8. Component Props getter and reactivity
    "transforms destructured component props access to getPropValue": {
      code: `
        const Component_Header = ({ title }) => {
          return <h1>{title}</h1>;
        };
      `,
    },
    // "transforms props member access to getPropValue": {
    //   code: `
    //     const Component_Card = (props) => {
    //       return <h1>{props.title}</h1>;
    //     };
    //   `,
    // },
    "transforms props destructured in function body to getPropValue": {
      code: `
        const Component_Card = (props) => {
          const { title } = props;
          return <h1>{title}</h1>;
        };
      `,
    },
    "treats component props as reactive dependencies in expressions": {
      code: `
        const Component_Item = ({ count }) => {
          return <div>{count + 1}</div>;
        };
      `,
    },

    // 9. Auto-infer dependencies for compute and effect
    "automatically infers dependencies for compute shorthand": {
      code: `
        const Component_Stats = () => {
          const a = observe(1);
          const b = observe(2);
          const sum = compute(() => a + b / b - a / 2);
          return <div>{sum}</div>;
        };
      `,
    },
    "preserves explicitly provided dependencies for compute": {
      code: `
        const Component_ExplicitCompute = () => {
          const a = observe(1);
          const sum = compute(() => a * 2, [a]);
          return <div>{sum}</div>;
        };
      `,
    },
    "automatically infers dependencies for effect shorthand": {
      code: `
        const Component_EffectDemo = () => {
          const count = observe(0);
          effect(() => {
            console.log(count);
          });
          return <div>Demo</div>;
        };
      `,
    },
    "preserves explicitly provided dependencies for effect": {
      code: `
        const Component_ExplicitEffect = () => {
          const count = observe(0);
          effect(() => {
            console.log(count);
          }, [count]);
          return <div>Demo</div>;
        };
      `,
    },
    "transforms $ shorthand alias to compute with dependencies": {
      code: `
        const Component_AliasDemo = () => {
          const count = observe(5);
          const doubled = $(() => count * 2);
          return <div>{doubled}</div>;
        };
      `,
    },
    "removes nested compute inside JSX attribute": {
      code: `
        const Component_Nested = () => {
          const active = observe(true);
          return <div className={compute(() => (active ? "active" : "inactive"))} />;
        };
      `,
    },
    "define Context": {
      code: `
        const Store = createContext({
            a: 1,
            b: 2,
            c: 0,
            d: {a: 1},
            e: [1, 2, 3],
        })

        const actionA = () => {
            const c = store.a + store.b;
            return c 
        }

        function actionB() {
            const c = store.a + store.b;
            return c 
        }
        `,
    },
    "import Context": {
      code: `
        const Component_SomeComponent = () => {
          const ctx = loadContext()
          const reassigned = ctx.c;
          const test_compute = compute(ctx.a + ctx.b)

          const handleMouseDown = () => {
            ctx.c = ctx.a + ctx.b
          }
          
          return (
            <div 
              handle:click={() => {
                ctx.b = ctx.a / ctx.b;
              }}
              handle:mousedown={handleMouseDown}
              style={{
                opacity: ctx.b + ctx.a,
                position: ctx.c
              }}
            >Hello World
            </div>
          )
        };
        `,
    },
  },
});