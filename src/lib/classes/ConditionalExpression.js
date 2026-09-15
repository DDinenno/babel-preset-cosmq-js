import { CONDITIONAL_EXPRESSIONS } from "../constants";

class ConditionExpression {
    if = null;
    elseIf = [];
    else = null;
    deps = [];

    path = null;
    scope = null;
    t = null;

    constructor(t, path) {
        this.t = t;
        this.path = path;
        this.scope = path.scope;
    }

    appendObservablesToDeps(child, condition) {
        const t = this.t

        if (condition) {
            this.path.traverse({
                CallExpression: (p) => {
                    if (child.expression.callee !== p.node) return;
                    if (CONDITIONAL_EXPRESSIONS.includes(p.node.callee.name)) {
                        p.traverse({
                            Identifier: (ip) => {
                                const binding = ip.scope.getBinding(ip.node.name);

                                if (!binding) return;
                                if (CONDITIONAL_EXPRESSIONS.includes(ip.node.name)) return;
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
        const t = this.t

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
        const t = this.t
        const expressions = [];

        const mapExpression = (expression) => {
            if (expression == null) return;

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

export default ConditionExpression