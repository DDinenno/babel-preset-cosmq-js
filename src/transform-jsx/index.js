import { CONTEXT_PREFIX } from "../lib/constants.js";
import * as assert from "../lib/assertions.js";
import * as query from "../lib/query.js";
import * as utils from "../lib/utils.js";
import generatePkg from "@babel/generator";
const generate = generatePkg.default || generatePkg;

export default function (babel) {
  const { types: t } = babel;

  const transformComputed = (path) => {
    if (assert.isInnerFunction(path)) return;
    if (assert.isWrappedInComputedFunc(path)) return;
    if (assert.isWrappedInConditionalStatement(path)) return;
    if (assert.isWrappedInEffectFunc(path)) return;
    if (assert.isWrappedInSetter(path)) return;
    if (assert.isModuleMethod(path, "conditional", path.node)) return false;
    if (assert.isInReactiveList(path)) return false;
    if (assert.isWrappedInObserveFunc(path)) return false;

    if (path.node.type === "CallExpression") {
      return false;
    }

    if (path.isJSXAttribute()) {
      if (!path.node.value || !t.isJSXExpressionContainer(path.node.value) ||
        assert.isWrappedInComputedFunc(path)) return

      const innerExpression = path.node.value.expression;

      //  Prevent infinite loops
      if (

        innerExpression.type === "ArrowFunctionExpression" ||
        innerExpression.type === "Identifier" ||
        assert.isComputeModuleMethod(path, innerExpression)
      ) {
        return;
      }

      const observables = [
        ...query.findNestedObservables(path),
        ...query.findNestedIdentifiers(path, utils.isPropIdentifier), // assume props are observables
        // ...query.findNestedIdentifiers(path, assert.isImportIdentifier), // assume imports are observables
      ]
        .filter(p => query.findComputedBlockStatement(p)?.scope !== p.scope)
        .map((p) => p.node)

      if (observables.length === 0) {
        return;
      }

      const callee = t.memberExpression(
        t.identifier("Cosmq"),
        t.identifier("compute")
      );

      const arrowFunc = t.arrowFunctionExpression(
        [],
        t.blockStatement([
          t.returnStatement(innerExpression)
        ])
      );

      const depArray = t.arrayExpression(observables);
      const callExpression = t.callExpression(callee, [arrowFunc, depArray]);
      path.node.value.expression = callExpression;


      t.addComment(callExpression, "leading", "COSMQ - Injected Computed wrapper", false);

      path.traverse({
        CallExpression(p) {
          if (callExpression === p.node) {
            return
          }

          // Removes inner computed calles
          if (assert.isWrappedInComputedFunc(p) || true) {
            const callbackArg = p.node.arguments[0];


            if (callbackArg && (callbackArg.type === 'ArrowFunctionExpression' || callbackArg.type === 'FunctionExpression')) {
              const functionBody = callbackArg.body;

              if (functionBody.type === 'BlockStatement') {
                const returnStmt = functionBody.body.find(st => st.type === 'ReturnStatement');
                if (returnStmt && returnStmt.argument) {
                  p.replaceWith(returnStmt.argument);
                  t.addComment(returnStmt.argument, "leading", "COSMQ - Removed Nested Compute", false);

                }
              }
              else {
                p.replaceWith(functionBody);
                t.addComment(functionBody, "leading", "COSMQ - Removed Nested Compute", false);
              }
            } else if (callbackArg) {
              if (callbackArg.type !== "ConditionalExpression") return


              if (p.node.type === "CallExpression" && p.node.callee.name === "compute") {
                p.replaceWith(callbackArg);
                t.addComment(callbackArg, "leading", "COSMQ - Removed Nested Compute", false);
              }
            }
          }
        }
      });
    } else if (
      (path.parent && path.parent.type === "VariableDeclarator") ||
      (path.node.type !== "CallExpression" && path.parent && path.parent.type === "JSXExpressionContainer")
    ) {
      if (path.parent && path.parent.type === "VariableDeclarator") {
        const componentRoot = query.findComponentRoot(path);
        if (componentRoot && componentRoot !== query.findFunctionRoot(path)) {
          return;
        }
      }

      const observables = [
        ...query.findNestedObservables(path),
        ...query.findNestedIdentifiers(path, utils.isPropIdentifier), // assume props are observables
        // ...query.findNestedIdentifiers(path, assert.isImportIdentifier), // assume imports are observables
      ]
        .map((p) => p.node)

      if (observables.length) {
        const callee = t.memberExpression(
          t.identifier("Cosmq"),
          t.identifier("compute"),
        );

        const depArray = t.arrayExpression(observables);
        const arrowFunc = t.ArrowFunctionExpression([], path.node);
        const callExpression = t.callExpression(callee, [arrowFunc, depArray]);
        path.replaceWith(callExpression, path.node);
      }
    }
  };

  const transformPropGetter = (path) => {
    const callee = t.memberExpression(
      t.identifier("Cosmq"),
      t.identifier("getPropValue"),
    );

    const callExpression = t.callExpression(callee, [path.node]);
    path.replaceWith(callExpression);
  };

  const transformJSXElement = (path, inner = false) => {
    var openingElement = path.node.openingElement;
    var tagName = openingElement.name.name;
    var reactIdentifier = t.identifier("Cosmq");

    // apply all other transformers before this one, otherwise causes side effects
    path.traverse({
      ...transformGroup
    });

    if (tagName === "ReactiveList") {
      const fnName = "reactiveList";

      let data = null;
      let key = null;
      let children = t.arrayExpression([]);
      let body = null
      const openingEl = path.node.openingElement


      if (!path.node.children || path.node.children.length === 0) throw new Error("Missing children in ReactiveList")
      path.node.children.forEach(child => {
        if (child.type === "JSXText") return

        if (child.type === "JSXExpressionContainer" && child.expression.type === "ArrowFunctionExpression") {
          body = child.expression
        } else {
          throw new Error("Expexted a arrow function expression as a child of ReactiveList")
        }
      })

      if (!openingEl.attributes || !openingEl.attributes.length) throw new Error("Missing data attribute in ReactiveList")

      openingEl.attributes.forEach((attr) => {
        if (attr.type === "JSXSpreadAttribute") {
          throw new Error("Spread attributes are not supported in ReactiveList");
        }

        if (attr.name.name === "data") {
          data = attr.value.expression
        }

        if (attr.name.name === "key" && attr.value.type === "JSXExpressionContainer") {
          key = attr.value.expression
        }
      });

      path.traverse({
        JSXElement: (path) => transformJSXElement(path, true),
      });


      if (!key) {
        throw new Error("Missing required prop 'key' in ReactiveList")
      }

      if (!data) {
        throw new Error("Missing required prop 'data' in ReactiveList")
      }

      if (!body) {
        throw new Error("Missing required child in ReactiveList")
      }

      if (body.type !== "ArrowFunctionExpression") throw new Error("Invalid body type in ReactiveList")
      body = t.arrowFunctionExpression(body.params, body.body)

      const callee = t.memberExpression(reactIdentifier, t.identifier(fnName));
      const callExpression = t.callExpression(callee, [
        data,
        t.objectExpression([t.objectProperty(t.identifier("getKey"), key)]),
        body,
      ]);


      path.replaceWith(callExpression, path.node)
    }

    else if (tagName[0] === tagName[0].toUpperCase()) {

      const componentName = tagName.replace(/^Component_/, "");
      const componentDeclarationName = `Component_${componentName}`;

      const isDeclaredInFile = !!query.getRootBoundNode(
        path,
        componentDeclarationName,
      );

      var createElementIdentifier = t.identifier("registerComponent");
      var callee = t.memberExpression(reactIdentifier, createElementIdentifier);
      var callExpression = t.callExpression(callee, [
        t.stringLiteral(componentName),
        t.identifier(isDeclaredInFile ? componentDeclarationName : tagName),
        query.getJSXProperties(t, path, true),
      ]);

      path.replaceWith(callExpression, path.node);
    } else {
      const children = t.arrayExpression([]);
      children.elements = path.node.children;

      const fnName = "registerElement";

      path.traverse({
        JSXElement: (path) => transformJSXElement(path, true),
      });

      const callee = t.memberExpression(reactIdentifier, t.identifier(fnName));
      const callExpression = t.callExpression(callee, [
        t.stringLiteral(tagName),
        query.getJSXProperties(t, path),
        children,
      ]);

      path.replaceWith(callExpression, path.node);
    }
  };

  function getRootBoundNode2(path, name) {
    let binding = path.scope.getBinding(name);

    if (!binding || !binding.path || !binding.path.node || !binding.path.node.init) {
      return;
    }


    let init = binding.path.node.init;

    if (init.type === "Identifier") {
      return getRootBoundNode2(binding.path, init.name);
    }

    if (init.type === "MemberExpression") {
      if (init.object.type === "Identifier") {
        return getRootBoundNode2(binding.path, init.object.name);
      }
      return binding;
    }

    return binding;
  }


  const transformAssignment = (path) => {
    if (!path || path.type !== "AssignmentExpression" || !path.node || !path.node.left) return

    let assignTo = path.node.left.name;

    const observable = query.getObservableBinding(path, assignTo);
    if (!observable) return;

    if (observable.path.node.type !== "VariableDeclarator")
      throw new Error(
        "Observable cannot be set outside the component it was initialized in!",
      );

    const exp = t.callExpression(
      t.memberExpression(t.identifier(assignTo), t.identifier("set")),
      [path.node.right],
    )

    path.replaceWith(exp);
  };


  const transformVariableDeclaration = path => {
    path.node.declarations.forEach((decl) => {

      let initType;

      if (assert.isModuleMethod(path, "loadContext", decl.init)) {
        initType = "loadContext"
      }
      if (assert.isModuleMethod(path, "createContext", decl.init)) {
        initType = "createContext"
      }

      if (decl.id.name === "Store") {
        const callee = decl.init.callee;

        if (callee.type === "Identifier") {
          const binding = path.scope.getBinding(callee.name);

        }
      }
      if (!initType) return;

      if (decl.id.type === "ObjectPattern") {
        const uniqueId = path.scope.generateUidIdentifier("destructured");

        decl.id.properties.forEach(p => {
          const propName = p.type === "ObjectProperty" ? p.key.name : p.argument.name

          const localBindingName = p.type === "ObjectProperty" ? p.value.name : p.argument.name;
          const binding = path.scope.getBinding(localBindingName);
          // console.log("propName", propName)

          if (binding) {
            [...binding.constantViolations, ...binding.referencePaths].forEach(refPath => {

              console.log("refPath", propName, p.type)
              let propertyName = propName
              if (p.type === "RestElement") {
                const propNode = refPath.parentPath.node.property;
                propertyName = propNode.type === "Identifier" ? propNode.name : propNode.value;
              }

              const identifierString = `${CONTEXT_PREFIX}${uniqueId.name}_${propertyName}`;

              const transformedValue = p.type === "RestElement" ?
                t.memberExpression(t.identifier(refPath.node.name), t.identifier(propertyName)) : t.identifier(propertyName)

              const hoisted = t.variableDeclaration("const", [
                t.variableDeclarator(t.identifier(identifierString), transformedValue)
              ])

              if (!path.scope.getBinding(identifierString)) {
                if (initType === "createContext") {
                  const refBlock = query.findRootBlockStatement(refPath)
                  if (!refBlock) return

                  const [newDeclPath] = refBlock.unshiftContainer("body", hoisted);
                  refBlock.scope.registerDeclaration(newDeclPath);
                } else {
                  const [newDeclPath] = path.insertAfter(hoisted);
                  path.scope.registerDeclaration(newDeclPath);
                }
              }


              if (p.type === "ObjectProperty") {

                if (refPath.isAssignmentExpression()) {
                  refPath.replaceWith(t.assignmentExpression(refPath.node.operator, t.identifier(identifierString), refPath.node.right));
                } else {
                  refPath.replaceWith(
                    t.identifier(identifierString)
                  );
                }

              } else if (refPath.parentPath.isMemberExpression()) {
                refPath.parentPath.replaceWith(t.identifier(identifierString));
              }
            });
          }
        });
      }

      if (decl.id.type === "Identifier") {
        const varName = decl.id.name;
        const binding = path.scope.getBinding(varName);
        if (!binding) return

        binding.referencePaths.forEach((refPath) => {
          const refBlock = query.findRootBlockStatement(refPath)

          const identifierString = `${CONTEXT_PREFIX}${refPath.node.name}_${refPath.parentPath.node.property.name}`
          if (!identifierString) return

          const isBindingHoisted = refBlock.get("body").find((p) => {
            return p.isVariableDeclaration() && p.node.declarations.some(d => d.id.name === identifierString)
          });
          if (!isBindingHoisted) {
            const hoisted = t.variableDeclaration("const", [
              t.variableDeclarator(t.identifier(identifierString), t.memberExpression(t.identifier(refPath.node.name), t.identifier(refPath.parentPath.node.property.name)))
            ])

            if (initType === "createContext") {
              const refBlock = query.findRootBlockStatement(refPath)
              if (!refBlock) return

              const [newDeclPath] = refBlock.unshiftContainer("body", hoisted);
              refBlock.scope.registerDeclaration(newDeclPath);
            } else {
              const [newDeclPath] = path.insertAfter(hoisted);
              path.scope.registerDeclaration(newDeclPath);
            }

          }

          refPath.parentPath.replaceWith(t.identifier(identifierString));
        });

      }
    })
  }


  const transformIdentifier = (path) => {
    if (
      path.parent?.type === "ObjectProperty" &&
      path.parent?.key === path.node &&
      !path?.parent?.computed
    ) {
      return;
    }

    if (
      ["RestElement", "VariableDeclarator"].includes(path.parent?.type)
    ) {
      return;
    }

    if (query.getObservableBinding(path, path.node.name)) {
      const excludeParentTypes = [
        "ReturnStatement",
        "VariableDeclarator",
        "RestElement",
        "JSXExpressionContainer"
      ];

      if (excludeParentTypes.includes(path.parent?.type)) return;
      if (assert.isIdentifierInDeps(path)) return;
      if (assert.isInElement(path)) return;
      if (assert.isInComponentProps(path)) return;
      if (assert.isIdentifierInJSXAttribute(path)) return;
      if (assert.isObservableAccessed(path)) return;
      if (assert.isObservableAssignment(path)) return;
      if (assert.isReactiveListData(path)) return;
      if (assert.isWrappedInObserveFunc(path)) return;

      if (query.getContextVariableBinding(path, path.node.name)) {
        if (path.parent?.type === "AssignmentExpression") {
          path.parentPath.replaceWith(
            t.callExpression(
              t.memberExpression(t.identifier(path.node.name), t.identifier("set")),
              [path.parentPath.node.right],
            )
          );
        } else {
          const callee = t.memberExpression(
            t.identifier(path.node.name),
            t.identifier("value"),
          );

          path.replaceWith(callee);
        }
        return;
      }

      const callee = t.memberExpression(
        t.identifier(path.node.name),
        t.identifier("value"),
      );

      path.replaceWith(callee);
    } else if (utils.isPropIdentifier(path)) {
      if (assert.isWrappedInPropertyValueGetter(path)) return;
      if (assert.isIdentifierInDeps(path)) return;
      if (assert.isIdentifierInJSXAttribute(path)) return;
      if (assert.isObservableAccessed(path)) return;
      if (assert.isObservableAssignment(path)) return;
      if (assert.isReactiveListData(path)) return;
      if (assert.isWrappedInObserveFunc(path)) return;

      transformPropGetter(path);
    }
  };

  const transformCallee = (path, callee, from, to) => {
    if (callee.type === "Identifier") {
      const binding = path.scope.getBinding(callee.name);
      if (!binding && callee.name == from) {
        callee.name = to;
        return;
      }
    }

    if (callee.type === "MemberExpression") {
      if (callee.type === "MemberExpression") {
        if (callee.property.name === from) {
          callee.property.name = to
          return
        }
      }
    }

    throw new Error(`Unhandled callee transformation ${callee.type}`)
  }

  const transformCallExpression = (path) => {
    if (
      assert.isModuleMethod(path, "effect") ||
      assert.isModuleMethod(path, "compute")
    ) {
      const body =
        path.node.arguments[0].type !== "ArrowFunctionExpression"
          ? t.arrowFunctionExpression([], path.node.arguments[0])
          : path.node.arguments[0];

      if (assert.isComputeAliasModuleMethod(path)) {
        transformCallee(path, path.node.callee, "$", "compute")
      }

      // transforms shorthand methods to include deps, if not provided
      if (path.node.arguments[1] == null) {
        const observables = {};

        const list = [
          ...query.findNestedObservables(path),
          ...query.findNestedIdentifiers(path, utils.isPropIdentifier), // assume props are observables
          // ...query.findNestedIdentifiers(path, assert.isImportIdentifier), // assume imports are observables
        ];

        list.forEach((obsPath) => {
          if (obsPath.parentPath.node.type === "JSXExpressionContainer") return;

          const invalidConditions = assert.matchParentRecursively(
            obsPath,
            (p) =>
              (
                assert.isModuleMethod(p, "compute") && p !== path) ||
              assert.isWrappedInConditionalStatement(p) ||
              assert.isInConditionalCondition(p)
          ) ||
            (
              obsPath.parentPath?.type === "MemberExpression" &&
              (assert.isObservableAccessed(obsPath) ||
                assert.isObservableAssignment(obsPath))
            ) ||
            (obsPath.parentPath?.type === "AssignmentExpression")

          if (invalidConditions)
            return;

          observables[obsPath.node.name] = obsPath.node;
        });

        const deps = t.arrayExpression(Object.values(observables));

        path.node.arguments = [body, deps];
      }
    } else {
      transformComputed(path);
    }
  };

  const transformJSXText = (path) => {
    // remove Blank JSXText
    if (path.node.value.replace(/\n|\r\n|\s/gi, "").length === 0) {
      path.remove();
    } else {
      path.replaceWith(t.stringLiteral(path.node.value));
    }
  }


  const transformJSXExpressionContainer = (path) => {
    if (assert.isModuleMethod(path, "compute", path.node.expression)) {
      const component = query.findComponentRoot(path);
      if (!component) return;

      const block = query.findComponentBlockStatement(path);
      if (!block) throw new Error("Failed to find component block");

      const returnIndex = block.node.body.findIndex(
        (n) => n.type === "ReturnStatement",
      );

      if (returnIndex !== -1) {
        return path.replaceWith(path.node.expression);
      }
    } else path.replaceWith(path.node.expression);
  }


  const transformGroup = {
    VariableDeclaration: transformVariableDeclaration,
    Identifier: transformIdentifier,
    CallExpression: transformCallExpression,
    ConditionalExpression: transformComputed,
    BinaryExpression: transformComputed,
    LogicalExpression: transformComputed,
    TemplateLiteral: transformComputed,
    AssignmentExpression: transformAssignment,
    JSXAttribute: transformComputed,
    JSXElement: transformJSXElement,
    JSXText: transformJSXText,
  }

  return {
    name: "custom-jsx-plugin",
    manipulateOptions: function manipulateOptions(opts, parserOpts) {
      parserOpts.plugins.push("jsx");
    },
    visitor: {
      ...transformGroup,
      JSXExpressionContainer: transformJSXExpressionContainer
    },
  };
};
