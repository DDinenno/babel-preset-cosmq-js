
module.exports = function () {
    return {
        plugins: [
            require("./babel-plugin-transform-jsx"),
            require("./babel-plugin-transform-jsx-conditional")
        ],
    };
};

