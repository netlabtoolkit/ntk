({
    appDir: 'app',
    baseUrl: 'scripts',
    mainConfigFile: 'app/scripts/main.js',
    dir: 'server/dist',
	removeCombined: true,
    findNestedDependencies: true,
    optimize: 'uglify2',
    optimizeCSS: false,
	fileExclusionRegExp: /^scss$/
})
