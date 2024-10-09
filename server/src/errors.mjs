/**
 * @param {string} errorName
 * @param {string} [msg]
 * @param {Object} [options]
 * @return {Error}
 */
export function error(errorName, msg, options) {
  const err = new Error(msg, options);
  err.name = errorName;
  return err;
}
