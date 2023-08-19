
module.exports = function () {
    return {
        plugins: [
            require("./transform-jsx"),
            require("./transform-jsx-conditional"),
        ],
    };
};

