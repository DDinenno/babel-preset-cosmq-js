const babel = require("@babel/core");
const cosmqPreset = require("../index");

describe("babel-preset-cosmq", () => {
  it("exports preset object with transform-jsx and transform-jsx-conditional plugins", () => {
    const preset = cosmqPreset();
    expect(preset).toBeDefined();
    expect(Array.isArray(preset.plugins)).toBe(true);
    expect(preset.plugins.length).toBe(2);
  });

  it("transforms a complete component with JSX, conditionals, and observables", () => {
    const inputCode = `
      const Component_TodoApp = ({ initialTitle }) => {
        const items = observe([]);
        const text = observe("");

        const handleAdd = () => {
          items = items.concat({ id: Date.now(), title: text });
          text = "";
        };

        return (
          <div className="todo-app">
            <h1>{initialTitle}</h1>
            <input
              value={text}
              handle:input={(e) => {
                text = e.target.value;
              }}
            />
            <button handle:click={handleAdd}>Add</button>

            {IF(items.length === 0)(
              <div>No items yet.</div>
            )}
            {ELSE()(
              <ReactiveList data={items} key={(item) => item.id}>
                {(item) => (
                  <li>
                    <span>{item.title}</span>
                  </li>
                )}
              </ReactiveList>
            )}
          </div>
        );
      };

      const app = <TodoApp initialTitle="My Todos" />;
    `;

    const result = babel.transformSync(inputCode, {
      presets: [cosmqPreset],
      configFile: false,
      babelrc: false,
    });

    expect(result.code).toBeDefined();
    // Verify registerComponent registration
    expect(result.code).toContain("Cosmq.registerComponent");
    // Verify native element registration
    expect(result.code).toContain('Cosmq.registerElement("div"');
    // Verify conditional transformation
    expect(result.code).toContain("Cosmq.conditional");
    // Verify ReactiveList transformation
    expect(result.code).toContain("Cosmq.reactiveList");
    // Verify prop passed to heading
    expect(result.code).toContain('Cosmq.registerElement("h1", {}, [initialTitle])');
    // Verify observable assignment to .set()
    expect(result.code).toContain("items.set");
    expect(result.code).toContain("text.set");
  });
});
