module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    // compiles 'worklet' functions for VisionCamera frame processors (live beauty preview)
    plugins: ["react-native-worklets-core/plugin"],
  };
};
