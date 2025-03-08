"use strict";
const assert = require("./lib/assertions");
const query = require("./lib/query");
const utils = require("./lib/utils");

exports.__esModule = true;

exports.default = function (babel) {
  const { types: t } = babel;

  function isImportIdentifier(path) {
    if (
      path.parent &&
      (path.parent.type === "ImportSpecifier" ||
        path.parent.type === "ImportDefaultSpecifier")
    )
      return false;
    const binding = query.getRootBoundNode(path, path.node.name);
    if (binding && binding.kind === "module") {
      if (
        binding.path &&
        binding.path.parentPath &&
        binding.path.parentPath.node &&
        binding.path.parentPath.node.source &&
        binding.path.parentPath.node.source.value === "cosmq-js"
      )
        return false;
      return true;
    }
    return false;
  }

  function mapPropertyValue(node) {
    if (node == null) {
      return t.booleanLiteral(true);
    } else if (node.type === "JSXExpressionContainer") return node.expression;
    else if (node.type === "JSXExpressionContainer") return node.expression;
    return node;
  }

  function getProperties(path, component = false) {
    const attrsObject = t.objectExpression([]);
    const attributes = path.node.openingElement.attributes;
    const properties = [];

    attributes.forEach((attr) => {
      let property;
      const value = mapPropertyValue(attr.value);

      if (attr.name.type === "JSXNamespacedName")
        property = t.stringLiteral(
          attr.name.namespace.name + ":" + attr.name.name.name,
        );
      else property = t.stringLiteral(attr.name.name);

      properties.push(t.objectProperty(property, value));
    });

    if (component) {
      properties.push(
        t.objectProperty(
          t.stringLiteral("children"),
          t.arrayExpression(
            path.node.children.map((child) => mapPropertyValue(child)),
          ),
        ),
      );
    }

    attrsObject.properties = attrsObject.properties.concat(properties);

    return attrsObject;
  }

  const transformComputed = (path) => {
    if (assert.isInnerFunction(path)) return;
    if (assert.isWrappedInComputedFunc(path)) return;
    if (assert.isWrappedInConditionalStatement(path)) return;
    if (assert.isWrappedInComputedFunc(path)) return;
    if (assert.isWrappedInEffectFunc(path)) return;
    if (assert.isWrappedInSetter(path)) return;
    if (assert.isModuleMethod(path, "conditional", path.node)) return false;
    if (assert.isInObservableArray(path)) return false;
    if (assert.isWrappedInObserveFunc(path)) return false;

    if (path.node.type === "CallExpression") {
      return false;
    }
    if (
      (path.parent && path.parent.type === "VariableDeclarator") ||
      (path.parent.type === "JSXExpressionContainer" &&
        path.node.type !== "CallExpression")
    ) {
      const observables = [
        ...query.findNestedObservables(path),
        ...query.findNestedIdentifiers(path, isPropIdentifier), // assume props are observables
        // ...query.findNestedIdentifiers(path, isImportIdentifier), // assume imports are observables
      ].map((p) => p.node);

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

  function isObservableRef(path) {
    if (path.node.type !== "Identifier") return false;
    const name = path.node.name;
    const binding = query.getObservableBinding(path, name);

    if (binding) {
      const isRef = binding.referencePaths.find((p) => p === path);
      if (isRef) return true;
    }

    return false;
  }

  function isPropIdentifier(path) {
    const component = query.findComponentRoot(path);
    if (!component) return;

    const params = query.getFunctionParams(component);
    if (!params || params.length === 0) return;

    const isMember =
      path.parentPath.type === "MemberExpression" &&
      !path.parentPath.node.computed;
    const bindingName = isMember
      ? path.parentPath.node.object.name
      : path.node.name;

    const b = path.scope.getBinding(bindingName);
    if (!b) return;

    const isRef = b.referencePaths.find((rp) => rp === path);

    if (b.path.node.type === "ObjectPattern" && b.path.node === params[0]) {
      // prop is destructured within function param declaration
      if (!isRef) return;
      return true;
    } else {
      if (isMember) {
        // prop is accessed as a member of the param
        if (path.node.name === params[0].name) return;
        if (b.identifier.name !== params[0].name) return;
        return true;
      } else {
        // prop is destructured after param declaration, in the function body
        if (path.parent.type === "ObjectProperty") return;
        if (
          b.path.node.type === "VariableDeclarator" &&
          b.path.node.id.type === "ObjectPattern"
        ) {
          if (b.path.node.init.name === params[0].name) {
            return true;
          }
        }
      }
    }
  }

  let hoistCount = 0;

  const transformJSX = (path, inner = false) => {
    var openingElement = path.node.openingElement;
    var tagName = openingElement.name.name;
    const isComponent = tagName[0] === tagName[0].toUpperCase();
    var reactIdentifier = t.identifier("Cosmq");

    if (isComponent) {
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
        getProperties(path, true),
      ]);

      path.replaceWith(callExpression, path.node);
    } else {
      const children = t.arrayExpression([]);
      children.elements = path.node.children;

      const fnName = "registerElement";

      path.traverse({
        JSXElement: (path) => transformJSX(path, true),
      });

      const callee = t.memberExpression(reactIdentifier, t.identifier(fnName));
      const callExpression = t.callExpression(callee, [
        t.stringLiteral(tagName),
        getProperties(path),
        children,
      ]);

      path.replaceWith(callExpression, path.node);
    }
  };

  const transformAssignment = (path) => {
    const assignTo = path.node.left.name;

    const observable = query.getObservableBinding(path, assignTo);
    if (!observable) return;

    if (observable.path.node.type !== "VariableDeclarator")
      throw new Error(
        "Observable cannot be set outside the component it was initialized in!",
      );

    path.replaceWith(
      t.callExpression(
        t.memberExpression(t.identifier(assignTo), t.identifier("set")),
        [path.node.right],
      ),
      path.node,
    );
  };

  const transformIdentifier = (path) => {
    // if (isImportIdentifier(path)) {
    //   if (assert.isWrappedInPropertyValueGetter(path)) return;
    //   if (assert.isIdentifierInDeps(path)) return;

    //   if (!assert.isInnerFunction(path)) return
    //   if (assert.isIdentifierInDeps(path)) return;
    //   // if (assert.isInComponentProps(path)) return;
    //   if (assert.isIdentifierInJSXAttribute(path)) return;
    //   if (assert.isObservableAccessed(path)) return;
    //   if (assert.isObservableAssignment(path)) return;
    //   if (assert.isObservableArrayData(path)) return;

    //   transformPropGetter(path);
    // }
    // else

    if (isPropIdentifier(path)) {
      if (assert.isWrappedInPropertyValueGetter(path)) return;
      if (assert.isIdentifierInDeps(path)) return;

      if (assert.isIdentifierInDeps(path)) return;
      if (assert.isInComponentProps(path)) return;
      if (assert.isIdentifierInJSXAttribute(path)) return;
      if (assert.isObservableAccessed(path)) return;
      if (assert.isObservableAssignment(path)) return;
      if (assert.isObservableArrayData(path)) return;
      if (assert.isWrappedInObserveFunc(path)) return;

      transformPropGetter(path);
    } else if (isObservableRef(path)) {
      if (assert.isIdentifierInDeps(path)) return;
      if (assert.isInComponentProps(path)) return;
      if (assert.isIdentifierInJSXAttribute(path)) return;
      if (assert.isObservableAccessed(path)) return;
      if (assert.isObservableAssignment(path)) return;
      if (assert.isObservableArrayData(path)) return;
      if (path.parent && path.parent.type === "ReturnStatement") return;
      if (assert.isWrappedInObserveFunc(path)) return;

      const callee = t.memberExpression(
        t.identifier(path.node.name),
        t.identifier("value"),
      );
      const methodCall = t.expressionStatement(callee);

      path.replaceWith(methodCall);
    }
  };

  function extractMemberExpressionString(node) {
    if (!node) return "";

    // If it's an ExpressionStatement, get the actual expression
    if (node.type === "ExpressionStatement") {
      node = node.expression; // Unwrap ExpressionStatement
    }

    // Handle AssignmentExpression (e.g., `testing5 = 2`)
    if (node.type === "AssignmentExpression") {
      return getMemberExpressionString(node.left);
    }

    // Handle function calls (e.g., `test.testing1.testing2.something()`)
    if (node.type === "CallExpression") {
      return getMemberExpressionString(node.callee); // Extract the function being called
    }

    return getMemberExpressionString(node);
  }

  function getMemberExpressionString(node) {
    if (!node) return "";

    if (node.type === "Identifier") {
      return node.name;
    } else if (node.type === "ThisExpression") {
      return "this";
    } else if (node.type === "MemberExpression") {
      let objectStr = getMemberExpressionString(node.object);
      let propertyStr = node.computed
        ? `[${getMemberExpressionString(node.property)}]` // Bracket notation
        : `.${getMemberExpressionString(node.property)}`; // Dot notation
      return `${objectStr}${propertyStr}`;
    } else if (node.type === "StringLiteral") {
      return `"${node.value}"`; // Handles obj["stringKey"]
    } else if (node.type === "NumericLiteral") {
      return node.value; // Handles arr[0]
    }

    console.error("Unexpected node type:", node.type);
    return "";
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

      // transforms shorthand methods to include deps, if not provided
      if (path.node.arguments[1] == null) {
        const observables = {};

        const list = [
          ...query.findNestedObservables(path),
          ...query.findNestedIdentifiers(path, isPropIdentifier), // assume props are observables
          // ...query.findNestedIdentifiers(path, isImportIdentifier), // assume imports are observables
        ];

        list.forEach((obsPath) => {
          if (obsPath.parentPath.node.type === "JSXExpressionContainer") return;

          if (
            assert.matchParentRecursively(
              obsPath,
              (p) =>
                (assert.isModuleMethod(p, "compute") && p !== path) ||
                assert.isWrappedInConditionalStatement(p) ||
                assert.isInConditionalCondition(p),
            ) ||
            (obsPath.parentPath &&
              obsPath.parentPath.type === "MemberExpression" &&
              (assert.isObservableAccessed(obsPath) ||
                assert.isObservableAssignment(obsPath))) ||
            (obsPath.parentPath &&
              obsPath.parentPath.type === "AssignmentExpression")
          )
            return;

          observables[obsPath.node.name] = obsPath.node;
        });

        // const nonObs = query.findNestedIdentifiers(path, (p, found) => {
        //   if (observables[p.node.name]) return false;

        //   // observables[p.node.name] = p.node;
        //   utils.findNearestAncestor(p, (a) => {
        //     if (!a || !a.node) return;

        //     // if (a.node.type === "ExpressionStatement") {

        //     //   if (a.node.expression.type === "CallExpression" && a.node.expression.callee && a.node.expression.callee.object) {
        //     //     const str = extractMemberExpressionString(a.node.expression.callee.object)
        //     //     if (str != "") {
        //     //       console.log("call", str)
        //     //       observables[str] = a.node.expression.callee.object
        //     //     }

        //     //   } else if (a.node.expression.type === "MemberExpression") {
        //     //     const str = extractMemberExpressionString(a.node.expression)
        //     //     if (str != "") {
        //     //       observables[str] = a.node.expression
        //     //       console.log("exp", str)
        //     //     }

        //     //   }
        //     // }

        //     if (a.node.type === "ExpressionStatement") {

        //       a.traverse({
        //         MemberExpression: (mPath) => {
        //           if (mPath.parent.type === "CallExpression" && mPath.parent.type === "MemberExpression") return;
        //           if (mPath.node.computed) return;

        //           let initializedInComputed = false
        //           let computedExpression = false;

        //           mPath.traverse({
        //             MemberExpression: (p) => {
        //               if (mPath.node.computed) computedExpression = true;
        //             },
        //             Identifier: (p => {
        //               const binding = query.getRootBoundNode(p, p.node.name);
        //               if (!binding) return;

        //               if (binding.scope.block === body) {
        //                 initializedInComputed = true
        //               }

        //             })
        //           })

        //           if (computedExpression || initializedInComputed) return;

        //           console.log("test", extractMemberExpressionString(mPath.node))
        //           const str = extractMemberExpressionString(mPath.node)
        //           if (str != "") {
        //             observables[str] = mPath.node
        //           }
        //         }
        //       });

        //       // const node = a.node.expression
        //       // console.log(a.node)

        //       // if (node.type === "MemberExpression") {
        //       //   console.log(node.type)
        //       //   const str = extractMemberExpressionString(node)
        //       //   if (str != "") {
        //       //     observables[str] = node
        //       //     console.log("exp", str)
        //       //   }

        //       // }

        //     }
        //   })

        // });

        const deps = t.arrayExpression(Object.values(observables));

        path.node.arguments = [body, deps];
      }
    } else {
      transformComputed(path);
    }
  };

  return {
    name: "custom-jsx-plugin",
    manipulateOptions: function manipulateOptions(opts, parserOpts) {
      parserOpts.plugins.push("jsx");
    },
    visitor: {
      JSXExpressionContainer(path) {
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
            // prevent hoisting

            hoistCount++;
            const name = `computed__ref_${hoistCount}`;

            const hoisted = t.variableDeclaration("const", [
              t.variableDeclarator(t.identifier(name), path.node.expression),
            ]);

            let index = returnIndex;

            // has to traverse block to apply transformations on the recently hoisted variable,
            // in-case there's JSXElements deeply nested in the expression
            block.traverse({
              Identifier: transformIdentifier,
              CallExpression: transformCallExpression,
              ConditionalExpression: transformComputed,
              BinaryExpression: transformComputed,
              LogicalExpression: transformComputed,
              TemplateLiteral: transformComputed,
              AssignmentExpression: transformAssignment,
              JSXElement: transformJSX,
              JSXExpressionContainer(p) {
                p.replaceWith(p.node.expression);
              },
            });

            path.replaceWith(t.jsxExpressionContainer(t.identifier(name)));

            const parentVariable = query.findParentVariableDeclarator(path);

            if (parentVariable) {
              const matchedIndex = block.node.body.findIndex((n) => {
                if (n.type === "VariableDeclaration") {
                  if (
                    n.declarations.find(
                      (dec) =>
                        dec.id && dec.id.name === parentVariable.node.id.name,
                    )
                  ) {
                    return true;
                  }
                }
              });

              if (matchedIndex != -1) {
                // if referenced inside a variable, move the hoisted index before that variable
                index = matchedIndex;
              }
            }

            block.node.body = [
              ...block.node.body.slice(0, index),
              hoisted,
              ...block.node.body.slice(index, block.node.body.length),
            ];
          }
        } else path.replaceWith(path.node.expression);
      },
      JSXText(path) {
        // remove Blank JSXText
        if (path.node.value.replace(/\n|\r\n|\s/gi, "").length === 0) {
          path.remove();
        } else {
          path.replaceWith(t.stringLiteral(path.node.value));
        }
      },
      JSXElement(path) {
        path.traverse({
          Identifier: transformIdentifier,
          CallExpression: transformCallExpression,
          ConditionalExpression: transformComputed,
          BinaryExpression: transformComputed,
          LogicalExpression: transformComputed,
          TemplateLiteral: transformComputed,
          AssignmentExpression: transformAssignment,
        });

        transformJSX(path);
      },
      CallExpression: transformCallExpression,
      Identifier: transformIdentifier,
      ConditionalExpression: transformComputed,
      BinaryExpression: transformComputed,
      LogicalExpression: transformComputed,
      TemplateLiteral: transformComputed,
      AssignmentExpression: transformAssignment,
    },
  };
};

module.exports = exports["default"];
