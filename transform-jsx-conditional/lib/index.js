"use strict";

exports.__esModule = true;

const conditionalExpressions = ["IF", "ELSEIF", "ELSE"];

function isConditionExpression(node) {
  if (!node.expression) return false;

  const isIdentifier = node.expression.type === "Identifier";
  const isCallExp = node.expression.type === "CallExpression";

  if (isIdentifier || isCallExp) {
    if (!node.expression.callee || !node.expression.callee.callee) return;

    const name = node.expression.callee.callee.name;
    return conditionalExpressions.includes(name);
  }
}

function getConditionInfo(node) {
  if (!isConditionExpression(node))
    throw new Error("is not a conditional expression");

  const name = node.expression.callee.callee.name;
  const condition =
    node.expression.callee.arguments && node.expression.callee.arguments[0];
  const body = node.expression.arguments && node.expression.arguments[0];

  return { name, condition, body };
}

function isChildOf(path, targetPath) {
  if (!path) return false;
  if (path === targetPath) return true;
  return isChildOf(path.parentPath, targetPath);
}

exports.default = function (babel) {
  const { types: t } = babel;

  class ConditionExpression {
    if = null;
    elseIf = [];
    else = null;
    deps = [];
    scope = null;

    constructor(path) {
      this.path = path;
      this.scope = path.scope;
    }

    appendObservablesToDeps(child, condition) {
      if (condition) {
        this.path.traverse({
          CallExpression: (p) => {
            if (child.expression.callee !== p.node) return;
            if (conditionalExpressions.includes(p.node.callee.name)) {
              p.traverse({
                Identifier: (ip) => {
                  const binding = ip.scope.getBinding(ip.node.name);

                  if (!binding) return;
                  if (conditionalExpressions.includes(ip.node.name)) return;
                  if (!this.deps.some((n) => n.name === ip.node.name))
                    this.deps.push(ip.node);
                },
              });
            }
          },
        });
      }
    }

    appendCondition(child, type, condition, body) {
      if (type === "IF") {
        if (this.if != null)
          throw new Error("Expecting ELSEIF or ELSE condition, found IF");
        this.if = { condition, body };
      }
      if (type === "ELSEIF") {
        if (this.if == null)
          throw new Error("Expecting If Condition, found ELSEIF");
        if (this.else)
          throw new Error(
            "ELSEIF Condition cannot be placed after an ELSE condition"
          );
        this.elseIf.push({ condition, body });
      }
      if (type === "ELSE") {
        if (this.if == null)
          throw new Error("Expecting If Condition, found Else");
        this.else = { condition: t.booleanLiteral(true), body };
      }

      if (condition) this.appendObservablesToDeps(child, condition);
    }

    transform() {
      const expressions = [];

      const mapExpression = (expression) => {
        if (expression == null) return;

        // expressions.push(t.ifStatement(statement.condition, t.returnStatement(statement.body)))
        expressions.push(
          t.objectExpression([
            t.objectProperty(
              t.stringLiteral("__condition__"),
              t.arrowFunctionExpression([], expression.condition)
            ),
            t.objectProperty(
              t.stringLiteral("body"),
              t.arrowFunctionExpression(
                [],
                t.parenthesizedExpression(expression.body)
              )
            ),
          ])
        );
      };

      mapExpression(this.if);
      this.elseIf.forEach(mapExpression);
      mapExpression(this.else);

      const callee = t.memberExpression(
        t.identifier("Cosmq"),
        t.identifier("conditional")
      );

      return t.JSXExpressionContainer(
        t.callExpression(callee, [
          t.arrayExpression(this.deps),
          t.arrayExpression(expressions),
        ])
      );
    }
  }

  function transformExpression(path) {
    const children = [];
    let currentCondition = null;

    const previousChildren = path.node.children.filter((child) => {
      if (child.type === "JSXText") {
        if (child.value.replace(/\n|\r\n|\s|\t/gi, "").length === 0) {
          return false;
        }
      }
      return true;
    });

    // path.node.children.reduce((conditions, child) => {
    //   if (child.type === "JSXText") {
    //     if (child.value.replace(/\n|\r\n|\s|\t/gi, "").length === 0) {
    //       return conditions;
    //     }
    //   }

    //   const currentCondition = conditions.length - 1;
    //   if(conditions[currentCondition] === null) return;

    //   return conditions;
    // }, [])

    previousChildren.forEach((child, index) => {
      if (isConditionExpression(child)) {
        const { name, condition, body } = getConditionInfo(child);

        if (!currentCondition) {
          currentCondition = new ConditionExpression(path);
          currentCondition.appendCondition(child, name, condition, body);
        } else {
          if (name === "IF") {
            if (currentCondition.if != null) {
              children.push(currentCondition.transform());
              currentCondition = null;
            }

            // children.push(currentCondition.transform());
            currentCondition = new ConditionExpression(path);
            currentCondition.appendCondition(child, name, condition, body);
          }
          if (name === "ELSEIF")
            currentCondition.appendCondition(child, name, condition, body);
          if (name === "ELSE") {
            currentCondition.appendCondition(child, name, true, body);
            children.push(currentCondition.transform());
            currentCondition = null;
          }
        }
        if (currentCondition && index === previousChildren.length - 1) {
          children.push(currentCondition.transform());
          currentCondition = null;
        }
      } else {
        if (currentCondition) {
          children.push(currentCondition.transform());
          currentCondition = null;
        }

        children.push(child);
      }
    });

    path.node.children = children;
  }

  return {
    name: "ast-transform",
    visitor: {
      Identifier(path) {},
      BlockStatement(path) {
        path.traverse({
          JSXElement: transformExpression.bind(this),
        });
      },
      JSXElement(path) {
        transformExpression.bind(this)(path);
      },
    },
  };
};
