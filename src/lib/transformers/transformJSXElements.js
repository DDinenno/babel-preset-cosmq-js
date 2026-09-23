import * as assert from "../assertions.js";
import * as query from "../query.js";
import { CONTEXT_PREFIX } from "../constants.js";



const transformJSXElement = (t, path, inner = false) => {
    var openingElement = path.node?.openingElement;
    var tagName = openingElement?.name?.name;
    if (tagName == null) return

    var reactIdentifier = t.identifier("Cosmq");


    if (tagName === "ReactiveList") return

    if (tagName[0] === tagName[0].toUpperCase()) {

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

        const callee = t.memberExpression(reactIdentifier, t.identifier(fnName));
        const callExpression = t.callExpression(callee, [
            t.stringLiteral(tagName),
            query.getJSXProperties(t, path),
            children,
        ]);

        path.replaceWith(callExpression, path.node);
    }
};

const transformJSXText = (t, path) => {
    // remove Blank JSXText
    if (path.node.value.replace(/\n|\r\n|\s/gi, "").length === 0) {
        path.remove();
    } else {
        path.replaceWith(t.stringLiteral(path.node.value));
    }
}



const transformJSXExpressionContainer = (t, path) => {
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
    } else {

        if (!path.parentPath.isJSXAttribute()) {
            path.replaceWith(path.node.expression);
            return;
        }

    }
}

export default {
    name: "Transform JSX Elements",
    preJSX: {
        JSXText: transformJSXText,
    },
    JSX: {
        JSXElement: transformJSXElement,
        // JSXText: transformJSXText,
        // JSXElement: transformJSXElement,
        JSXExpressionContainer: transformJSXExpressionContainer
    },
    postJSX: {
    }
}