import * as assert from "../lib/assertions.js";
import * as query from "../lib/query.js";
import * as utils from "../lib/utils.js";
import generatePkg from "@babel/generator";
import { LIB_NAME, REACTIVE_LIST, REACTIVE_LIST_KEY_PROP } from "../lib/constants.js";
const generate = generatePkg.default || generatePkg;


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
        transformComputed(t, path);
    }
};

const transformComputed = (t, path) => {
    if (assert.isInnerFunction(path)) return;
    if (assert.isWrappedInComputedFunc(path)) return;
    if (assert.isWrappedInConditionalStatement(path)) return;
    if (assert.isWrappedInEffectFunc(path)) return;
    if (assert.isWrappedInSetter(path)) return;
    if (assert.isModuleMethod(path, "conditional", path.node)) return false;
    // if (assert.isInReactiveList(path)) return false;
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

                // Removes inner computed calls
                if (assert.isWrappedInComputedFunc(p) || true) {
                    if (p.node.callee.name !== "compute") return

                    const callbackArg = p.node.arguments[0];


                    if (callbackArg && (callbackArg.type === 'ArrowFunctionExpression' || callbackArg.type === 'FunctionExpression')) {
                        const functionBody = callbackArg.body;

                        if (functionBody.type === 'BlockStatement') {
                            const returnStmt = functionBody.body.find(st => st.type === 'ReturnStatement');
                            if (returnStmt && returnStmt.argument) {
                                p.replaceWith(returnStmt.argument);
                                t.addComment(returnStmt.argument, "leading", "COSMQ - Removed Nested Compute 1", false);

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
    }
}