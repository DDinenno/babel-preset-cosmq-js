function findNearestAncestor(path, matcher) {
  if (!path) return null;
  if (matcher(path)) return path;
  return findNearestAncestor(path.parentPath, matcher);
}

module.exports = {
  findNearestAncestor,
};
