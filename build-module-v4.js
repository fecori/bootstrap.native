var fs = require('fs');
var uglify = require('uglify-js');
var pack = require('./package.json');
var version = 'v' + pack.version;
var license = pack.license + '-License';
var libPath = __dirname + '/lib';
var { getModuleNames, error } = require('./lib/helpers');

module.exports = (options) => {
  // Arguments Sanity Check:
  if (options.only && options.ignore) {
    error('Error: You cannot specify both --only and --ignore.');
  }

  if (options.only) options.only = getModuleNames(options.only);
  if (options.ignore) options.ignore = getModuleNames(options.ignore);

  // Get a list of all modules:
  var allModules = fs.readdirSync(`${libPath}/V4`).filter(item => /-native\.js$/.test(item));

  // Get a list of modules to include:
  var modules = [];
  if (options.only) { // If --only, use that for modules
    modules = options.only.filter(function (item) {
      // Validate module names:
      var valid = getModuleNames(allModules).some(name => name === item);
      if (!valid) {
        console.warn(`Warning: ${item} is not a valid module name, continuing`);
      }
      return valid;
    });
  } else if (options.ignore) { // If --ignore, filter allModules
    // Filter allModules:
    modules = getModuleNames(allModules).filter(function (item) {
      // If not in ignore list, return true:
      return options.ignore.every(ignoreItem => ignoreItem !== item);
    });
  } else { // If neither --ignore or --only, use allModules
    modules = getModuleNames(allModules);
  }
  // If modules is an empty array, abort
  // This could happen if you passed non-module values to --only
  if (modules.length === 0) {
    error(`Error: No valid module names, aborting`);
  }

  // Use console.warn to avoid writing to stdout
  console.warn(`Building Native JavaScript for Bootstrap 4 ${version} ..`);
  if (options.minify) {
    console.warn('Minified Build');
  } else {
    console.warn('Unminified Build');
  }
  console.warn(`Included modules:
    ${modules.join('\n  ')}`);

  // Load modules:
  // Use Promises to avoid race conditions
  var promises = [];
  modules.forEach(function (name, i) {
    promises[i] = new Promise(function (resolve, reject) {
      fs.readFile(`${libPath}/V4/${name.toLowerCase()}-native.js`, 'utf8', function (err, contents) {
        if (err) reject(err);
        resolve(contents);
      });
    });
  });
  // When all modules are loaded, make bundle:
  var result = Promise.all(promises)
  .then(function (modules) {
    var header = '// Native Javascript for Bootstrap 4 ' + version + ' | © dnp_theme | ' + license + '\n';
    var bundle = wrap(modules.join(''));
    if (options.minify) {
      bundle = uglify.minify(bundle, {fromString: true}).code;
    }
    var output = header + bundle + '\n';
    process.stdout.on('error', function (err) {
      throw err; // Will be caught below
    });
    if (options.cli) {
      process.stdout.write(output, 'utf8');
    }
    return output;
  })
  .catch(error);

  function wrap(main) {
    var utils = fs.readFileSync(`${libPath}/V4/utils.js`, 'utf8').split('\n').join('\n  ');
    var init = fs.readFileSync(`${libPath}/V4/utils-init.js`, 'utf8').split('\n').join('\n  ');
    main = main.split('\n').join('\n  ');
    // Initialize arrays:
    // Arrays will be used in the template literal below
    var rootAttachments = [];
    var returns = [];
    // Populate arrays:
    modules.forEach(function (name) {
      rootAttachments.push(`root.${name} = bsn.${name};`);
      returns.push(`${name}: ${name}`);
    });
    // Custom UMD Template:
    return `(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
      // AMD support:
      define([], factory);
    } else if (typeof module === 'object' && module.exports) {
      // CommonJS-like:
      module.exports = factory();
    } else {
      // Browser globals (root is window)
      var bsn = factory();
      ${rootAttachments.join('\n    ')/* add indentation */}
    }
  }(this, function () {
    ${utils}
    BSN.version = '${pack.version}';
    ${main}
    ${init}
    return {
      ${returns.join(',\n    ')/* add indentation and comma */}
    };
  }));`;
    // End of Template
  }

  return result;
}
