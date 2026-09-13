const { pluginTester } = require("babel-plugin-tester");
const transformConditionalPlugin = require("../transform-jsx-conditional/lib/index");

pluginTester({
  plugin: transformConditionalPlugin,
  pluginName: "transform-jsx-conditional",
  formatResult: (code) => code,
  snapshot: true,
  tests: {
    "transforms simple IF conditional in JSX": {
      code: "const show = true; <div>{IF(show)(<span>Visible</span>)}</div>;",
    },
    "transforms IF and ELSE conditional": {
      code: `
        const isLoggedIn = false;
        <div>
          {IF(isLoggedIn)(<span>Welcome back!</span>)}
          {ELSE()(<span>Please log in.</span>)}
        </div>;
      `,
    },
    "transforms IF, ELSEIF, and ELSE conditional chain": {
      code: `
        const status = "loading";
        <div>
          {IF(status === "loading")(<span>Loading...</span>)}
          {ELSEIF(status === "error")(<span>Error occurred!</span>)}
          {ELSE()(<span>Ready</span>)}
        </div>;
      `,
    },
    "collects multiple observable dependencies in condition": {
      code: `
        const isReady = true;
        const count = 5;
        <div>
          {IF(isReady && count > 0)(<div>Active with items</div>)}
        </div>;
      `,
    },
    "handles multiple independent conditional blocks in same element": {
      code: `
        const a = true;
        const b = false;
        <div>
          {IF(a)(<span>A</span>)}
          <hr />
          {IF(b)(<span>B</span>)}
          {ELSE()(<span>Not B</span>)}
        </div>;
      `,
    },
  },
});
