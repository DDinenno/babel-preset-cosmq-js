import * as assert from "../assertions.js";
import * as query from "../query.js";
import * as utils from "../utils.js";

const transformRemoveInnerCallExpComputedCalls = (t, path, excludeNodes = []) => {
    path.traverse({
        CallExpression(p) {
            if (excludeNodes && excludeNodes.find(n => n === p.node)) return

            // Removes inner computed calls
            if (assert.isWrappedInComputedFunc(p) || true) {
                if (p.node.callee.name !== "compute") return

                const callbackArg = p.node.arguments[0];


                if (callbackArg && (callbackArg.type === 'ArrowFunctionExpression' || callbackArg.type === 'FunctionExpression')) {
                    const functionBody = callbackArg.body;

                    if (functionBody.type === 'BlockStatement') {
                        const returnStmt = functionBody.body.find(st => st.type === 'ReturnStatement');

                        if (functionBody.body.length == 1 && returnStmt && returnStmt.argument) {
                            p.replaceWith(returnStmt.argument);
                            t.addComment(returnStmt.argument, "leading", "COSMQ - Removed Nested Compute 1", false);
                        } else {

                            const exp = t.callExpression(
                                t.arrowFunctionExpression(
                                    [],
                                    t.cloneWithoutLoc(functionBody)
                                ),
                                []
                            )
                            p.replaceWith(exp);
                            t.addComment(exp, "leading", "COSMQ - Removed Nested Compute", false);

                        }


                    }
                    else if (p.node.type === "CallExpression" && p.node.callee.name === "compute") {
                        p.replaceWith(functionBody);
                        t.addComment(functionBody, "leading", "COSMQ - Removed Nested Compute 2", false);
                    }
                } else if (callbackArg) {
                    if (callbackArg.type !== "ConditionalExpression") return

                    p.replaceWith(callbackArg);
                    t.addComment(callbackArg, "leading", "COSMQ - Removed Nested Compute 3", false);

                }
            }
        }
    })

    path.scope.crawl()
}

const transformCallExpression = (t, path) => {
    if (
        assert.isModuleMethod(path, "effect") ||
        assert.isModuleMethod(path, "compute")
    ) {

        const body =
            path.node.arguments[0].type !== "ArrowFunctionExpression"
                ? t.arrowFunctionExpression([], path.node.arguments[0])
                : path.node.arguments[0];

        if (assert.isComputeAliasModuleMethod(path)) {
            utils.transformCallee(path, path.node.callee, "$", "compute")
        }

        // transforms shorthand methods to include deps, if not provided
        if (path.node.arguments[1] == null) {
            const observables = {};

            const list = utils.findNestedObservables(path)

            list.forEach((obsPath) => {
                if (obsPath.parentPath.node.type === "JSXExpressionContainer") return;

                const hasInvalidParent = assert.matchParentRecursively(obsPath, (p) => {
                    const isOtherCompute = assert.isModuleMethod(p, "compute") && p !== path;
                    return isOtherCompute ||
                        assert.isWrappedInConditionalStatement(p) ||
                        assert.isInConditionalCondition(p);
                });

                const parentType = obsPath.parentPath?.type;
                const isInvalidMemberAccess = parentType === "MemberExpression" &&
                    (assert.isObservableAccessed(obsPath) || assert.isObservableAssignment(obsPath));

                const isAssignment = parentType === "AssignmentExpression";

                if (hasInvalidParent || isInvalidMemberAccess || isAssignment) {
                    return;
                }

                observables[obsPath.node.name] = obsPath.node;
            });

            const deps = t.arrayExpression(Object.values(observables));

            path.replaceWith(
                t.callExpression(
                    t.cloneWithoutLoc(path.node.callee),
                    [t.cloneWithoutLoc(body), t.cloneWithoutLoc(deps)]
                )
            )

        }
    }
};


export const transformComputed = (t, path) => {
    if (assert.isInnerFunction(path)) return;
    if (assert.isWrappedInComputedFunc(path)) return;
    if (assert.isWrappedInConditionalStatement(path)) return;
    if (assert.isWrappedInEffectFunc(path)) return;
    if (assert.isWrappedInSetter(path)) return;
    if (assert.isModuleMethod(path, "conditional", path.node)) return;
    if (assert.isWrappedInObserveFunc(path)) return


    if (path.node.type === "CallExpression") {
        return
    }

    if (path.isJSXAttribute()) {
        if (!path.node.value || !t.isJSXExpressionContainer(path.node.value) ||
            assert.isWrappedInComputedFunc(path)) return

        const innerExpression = path.node.value.expression;

        if (

            innerExpression.type === "ArrowFunctionExpression" ||
            innerExpression.type === "Identifier" ||
            assert.isComputeModuleMethod(path, innerExpression)
        ) {
            return;
        }

        const observables = utils.findNestedObservables(path)
            .filter(p => query.findComputedBlockStatement(p)?.scope !== p.scope)
            .map((p) => p.node)

        if (!observables.length) return;

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

        const replacement = t.cloneWithoutLoc(path.node);
        replacement.value.expression = callExpression;
        path.replaceWith(replacement)


        t.addComment(callExpression, "leading", "COSMQ - Injected Computed wrapper", false);

        transformRemoveInnerCallExpComputedCalls(t, path, [path.node])
        path.scope.crawl()
    } else if (
        (path?.parent?.type === "VariableDeclarator") ||
        (path.node.type !== "CallExpression" && path?.parent?.type === "JSXExpressionContainer")
    ) {

        if (path.parent && path.parent.type === "VariableDeclarator") {
            const componentRoot = query.findComponentRoot(path);
            if (componentRoot && componentRoot !== query.findFunctionRoot(path)) {
                return;
            }
        }

        const observables = utils.findNestedObservables(path).map(p => p.node)

        if (observables.length) {
            const callee = t.memberExpression(
                t.identifier("Cosmq"),
                t.identifier("compute"),
            );

            const depArray = t.arrayExpression(observables);
            const arrowFunc = t.ArrowFunctionExpression([], t.cloneWithoutLoc(path.node));
            const callExpression = t.callExpression(callee, [arrowFunc, depArray]);

            path.replaceWith(callExpression);
        }
    }
}




export default {
    name: "Transform Computed",
    preJSX: {
        CallExpression: transformCallExpression,
        ConditionalExpression: transformComputed,
        BinaryExpression: transformComputed,
        LogicalExpression: transformComputed,
        TemplateLiteral: transformComputed,
        JSXAttribute: transformComputed,
        MemberExpression: transformComputed
    }
}