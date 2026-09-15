import * as assert from "../lib/assertions.js";
import * as query from "../lib/query.js";
import * as utils from "../lib/utils.js";
import generatePkg from "@babel/generator";
import { LIB_NAME, REACTIVE_LIST, REACTIVE_LIST_KEY_PROP } from "../lib/constants.js";
const generate = generatePkg.default || generatePkg;

const transformIdentifier = (t, path) => {
    // if (assert.isMapInJSXExpression(path)) {
    //   // path.parentPath.replaceWith(t.identifier(path.node.name));
    //   return;
    // }


    // if (path.node.name.startsWith("items2")) {
    //   // let compare = []

    //   // const parents = []
    //   // path.findParent((p) => {
    //   //   parents.push(p.type)
    //   // });
    //   // console.log("Is map", path.node.name, [...parents], assert.isMapInJSXExpression(path))

    // }


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
        if (assert.isJSXChildElement(path)) return

        const callee = t.memberExpression(
            t.identifier("Cosmq"),
            t.identifier("getPropValue"),
        );

        const callExpression = t.callExpression(callee, [path.node]);
        path.replaceWith(callExpression);
    }
};

const transformAssignment = (t, path) => {
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

export default {
    name: "Transform Observables",
    preJSX: {
        AssignmentExpression: transformAssignment,
        Identifier: transformIdentifier
    }
}