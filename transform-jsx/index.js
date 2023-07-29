"use strict";
const assert = require("./lib/assertions");
const query = require("./lib/query");

exports.__esModule = true;

exports.default = function (babel) {
  const { types: t } = babel;

  function getProperties(path) {
    const attrsObject = t.objectExpression([]);
    const attributes = path.node.openingElement.attributes;

    const mapProperties = attributes.map((attr) => {
      let property;
      let value;

      if (attr.name.type === "JSXNamespacedName")
        property = t.stringLiteral(
          attr.name.namespace.name + ":" + attr.name.name.name
        );
      else property = t.stringLiteral(attr.name.name);

      if (attr.value.type === "JSXExpressionContainer")
        value = attr.value.expression;
      else if (attr.value.type === "JSXExpressionContainer")
        value = attr.value.expression;
      else value = attr.value;

      return t.objectProperty(property, value);
    });

    attrsObject.properties = attrsObject.properties.concat(mapProperties);
    return attrsObject;
  }

  const transformComputed = (path) => {
    if (assert.isInnerFunction(path)) return;
    if (assert.isWrappedInComputedFunc(path)) return;
    if (assert.isWrappedInConditionalStatement(path)) return;
    if (assert.isWrappedInSetter(path)) return;
    if (assert.isCalleeModuleMethod(path.node, "conditional")) return false;

    if (
      (path.parent && path.parent.type === "VariableDeclarator") ||
      path.parent.type === "JSXExpressionContainer"
    ) {
      const observables = [
        ...query.findNestedObservables(path),
        ...query.findNestedIdentifiers(path, isPropIdentifier), // assume props are observables
      ].map((p) => p.node);

      if (observables.length) {
        const callee = t.memberExpression(
          t.identifier("PlaceholderJs"),
          t.identifier("compute")
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
      t.identifier("PlaceholderJs"),
      t.identifier("getPropValue")
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

    const isMember = path.parentPath.type === "MemberExpression";
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

  const transformJSX = (path) => {
    var openingElement = path.node.openingElement;
    var tagName = openingElement.name.name;
    const isComponent = tagName[0] === tagName[0].toUpperCase();

    if (isComponent) {
      const componentName = tagName.replace(/^Component_/, "");

      var reactIdentifier = t.identifier("PlaceholderJs");
      var createElementIdentifier = t.identifier("registerComponent");
      var callee = t.memberExpression(reactIdentifier, createElementIdentifier);
      var callExpression = t.callExpression(callee, [
        t.stringLiteral(componentName),
        t.identifier(tagName),
        getProperties(path),
      ]);

      path.replaceWith(callExpression, path.node);
    } else {
      const children = t.arrayExpression([]);
      children.elements = path.node.children;

      const typePropery = t.objectProperty(
        t.stringLiteral("type"),
        t.stringLiteral(tagName)
      );
      const attributesProperty = t.objectProperty(
        t.stringLiteral("properties"),
        getProperties(path)
      );
      const childrenProperty = t.objectProperty(
        t.stringLiteral("children"),
        children
      );

      const objProperties = [typePropery, attributesProperty, childrenProperty];
      const object = t.objectExpression(objProperties);

      path.replaceWith(object, path.node);
    }
  };

  const transformAssignment = (path) => {
    const assignTo = path.node.left.name;

    const observable = query.getObservableBinding(path, assignTo);
    if (!observable) return;

    if (observable.path.node.type !== "VariableDeclarator")
      throw new Error(
        "Observable cannot be set outside the component it was initialized in!"
      );

    path.replaceWith(
      t.callExpression(
        t.memberExpression(t.identifier(assignTo), t.identifier("set")),
        [path.node.right]
      ),
      path.node
    );
  };

  const transformIdentifier = (path) => {
    if (isPropIdentifier(path)) {
      if (assert.isWrappedInPropertyValueGetter(path)) return;
      if (assert.isIdentifierInDeps(path)) return;

      transformPropGetter(path);
    } else if (isObservableRef(path)) {
      if (assert.isIdentifierInDeps(path)) return;
      if (assert.isInComponentProps(path)) return;
      if (assert.isIdentifierInJSXAttribute(path)) return;
      if (assert.isObservableAccessed(path)) return;
      if (assert.isObservableAssignment(path)) return;

      const callee = t.memberExpression(
        t.identifier(path.node.name),
        t.identifier("value")
      );
      const methodCall = t.expressionStatement(callee);

      path.replaceWith(methodCall);
    }
  };

  return {
    name: "custom-jsx-plugin",
    manipulateOptions: function manipulateOptions(opts, parserOpts) {
      parserOpts.plugins.push("jsx");
    },
    visitor: {
      CallExpression(path) {
        if (
          assert.isModuleMethod(path, path.node, "effect") ||
          assert.isModuleMethod(path, path.node, "compute")
        ) {
          // transforms shorthand methods to include deps, if not provided
          if (path.node.arguments[1] == null) {
            const observables = [
              ...query.findNestedObservables(path),
              ...query.findNestedIdentifiers(path, isPropIdentifier), // assume props are observables,
            ].map((p) => p.node);

            const body =
              path.node.arguments[0].type !== "ArrowFunctionExpression"
                ? t.arrowFunctionExpression([], path.node.arguments[0])
                : path.node.arguments[0];
            const deps = t.arrayExpression(observables);

            path.node.arguments = [body, deps];
          }
        } else {
          transformComputed(path);
        }
      },
      JSXExpressionContainer(path) {
        if (assert.isModuleMethod(path, path.node.expression, "compute")) {
          const component = query.findComponentRoot(path);
          if (!component) return;

          const block = query.findComponentBlockStatement(path);
          if (!block) throw new Error("Failed to find component block");

          const returnIndex = block.node.body.findIndex(
            (n) => n.type === "ReturnStatement"
          );

          if (returnIndex !== -1) {
            hoistCount++;
            const name = `computed__ref_${hoistCount}`;

            const hoisted = t.variableDeclaration("const", [
              t.variableDeclarator(t.identifier(name), path.node.expression),
            ]);

            block.node.body = [
              ...block.node.body.slice(0, returnIndex),
              hoisted,
              ...block.node.body.slice(returnIndex, block.node.body.length),
            ];

            // has to traverse block to apply transformations on the recently hoisted variable,
            // in-case there's JSXElements deeply nested in the expression
            block.traverse({
              Identifier: transformIdentifier,
              CallExpression: transformComputed,
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
          CallExpression: transformComputed,
          ConditionalExpression: transformComputed,
          BinaryExpression: transformComputed,
          LogicalExpression: transformComputed,
          TemplateLiteral: transformComputed,
          AssignmentExpression: transformAssignment,
        });

        transformJSX(path);
      },
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
