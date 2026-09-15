import * as assert from "../assertions.js";
import ConditionExpression from "../classes/ConditionalExpression.js";



function getConditionInfo(node) {
    if (!assert.isConditionExpression(node))
        throw new Error("is not a conditional expression");

    const name = node.expression.callee.callee.name;
    const condition =
        node.expression.callee.arguments && node.expression.callee.arguments[0];
    const body = node.expression.arguments && node.expression.arguments[0];

    return { name, condition, body };
}


function transformJSXElement(t, path) {
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

    previousChildren.forEach((child, index) => {
        if (assert.isConditionExpression(child)) {
            const { name, condition, body } = getConditionInfo(child);

            if (!currentCondition) {
                ``
                currentCondition = new ConditionExpression(t, path);
                currentCondition.appendCondition(child, name, condition, body);
            } else {
                if (name === "IF") {
                    if (currentCondition.if != null) {
                        children.push(currentCondition.transform());
                        currentCondition = null;
                    }

                    currentCondition = new ConditionExpression(t, path);
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


export default {
    name: "Transform Conditional",
    preJSX: {
        BlockStatement: (t, path) => {
            path.traverse({
                JSXElement: (p) => transformJSXElement(t, p),
            });
        },
        JSXElement: (t, path) => {
            transformJSXElement(t, path);
        },
    }
}