'use strict';

module.exports = {
  GET: queryCollection,
  HEAD: queryCollection,
  OPTIONS: queryCollection,
  DELETE: deleteCollection
};

var _    = require('lodash'),
    util = require('../helpers/util');

/**
 * Returns an array of all resources in the collection.
 * If there are no resources, then an empty array is returned.  No 404 error is thrown.
 *
 * If the Swagger API includes "query" parameters, they can be used to filter the results.
 * Deep property names are allowed (e.g. "?address.city=New+York").
 * Query string params that are not defined in the Swagger API are ignored.
 *
 * @param   {Request}   req
 * @param   {Response}  res
 * @param   {function}  next
 * @param   {DataStore} dataStore
 */
function queryCollection(req, res, next, dataStore) {
  dataStore.getCollection(req.path, function(err, resources) {
    if (!err) {
      resources = filter(resources, req);

      if (resources.length === 0) {
        // There is no data, so use the current date/time as the "last-modified" header
        res.swagger.lastModified = new Date();

        // Use the default/example value, if there is one
        if (res.swagger.schema) {
          resources = res.swagger.schema.default || res.swagger.schema.example || [];
        }
      }
      else {
        // Determine the max "modifiedOn" date of the remaining items
        res.swagger.lastModified = _.max(resources, 'modifiedOn').modifiedOn;

        // Extract the "data" of each Resource
        resources = _.pluck(resources, 'data');
      }

      // Set the response body (unless it's already been set by other middleware)
      res.body = res.body || resources;
    }

    next(err);
  });
}

/**
 * Deletes all resources in the collection.
 * If there are no resources, then nothing happens.  No error is thrown.
 *
 * If the Swagger API includes "query" parameters, they can be used to filter what gets deleted.
 * Deep property names are allowed (e.g. "?address.city=New+York").
 * Query string params that are not defined in the Swagger API are ignored.
 *
 * @param   {Request}   req
 * @param   {Response}  res
 * @param   {function}  next
 * @param   {DataStore} dataStore
 */
function deleteCollection(req, res, next, dataStore) {
  dataStore.getCollection(req.path, function(err, resources) {
    if (err) {
      next(err);
    }
    else {
      // Determine which resources to delete, based on query params
      var resourcesToDelete = filter(resources, req);

      if (resourcesToDelete.length === 0) {
        sendResponse(null, []);
      }
      else if (resourcesToDelete.length === resources.length) {
        // Delete the whole collection
        dataStore.deleteCollection(req.path, sendResponse);
      }
      else {
        // Only delete the matching resources
        dataStore.delete(resourcesToDelete, sendResponse);
      }
    }
  });

  // Responds with the deleted resources
  function sendResponse(err, resources) {
    // Extract the "data" of each Resource
    resources = _.pluck(resources, 'data');

    // Use the current date/time as the "last-modified" header
    res.swagger.lastModified = new Date();

    // Set the response body (unless it's already been set by other middleware)
    if (err || res.body) {
      next(err);
    }
    else if (!res.swagger.isCollection) {
      // Response body is a single value, so only return the first item in the collection
      res.body = _.first(resources);
      next();
    }
    else {
      // Response body is the resource that was created/update/deleted
      res.body = resources;
      next();
    }
  }
}

/**
 * Filters the given {@link Resource} array, using the "query" params defined in the Swagger API.
 *
 * @param   {Resource[]}    resources
 * @param   {Request}       req
 * @returns {Resource[]}
 */
function filter(resources, req) {
  util.debug('There are %d resources in %s', resources.length, req.path);

  var responses = swaggerMockUtils.getResponsesBetween(req.swagger.operation, 200, 399);
    if (responses && responses.length > 0) {
      var mostLikelyResponse = responses[0],
          responseProperties = mostLikelyResponse.api.schema.properties
      ;
        var modelProperties;

      try {
          modelProperties = Object.keys(responseProperties.model.properties);
        } catch (ex) {}
        if (!modelProperties) {

          try {
            modelProperties = Object.keys(responseProperties.items.items.properties);
          } catch (ex) {
            return resources;
          }
        }
      var queryParams = _.filter(req.swagger.params, {in: 'query'});
        //filter queryParams that don't have to do with the requested models
        queryParams = _.filter(queryParams, function (param) {
          return modelProperties.indexOf(param.name) >= 0;
        });

        var filterCriteria = {data: {}};

      if (queryParams.length > 0) {
        _.each(queryParams, function (param) {
            if (req.query[param.name] !== undefined) {
              setDeepProperty(filterCriteria.data,  param.name, req.query([param.name]));
            }
          });
      }
        if (!_.isEmpty(filterCriteria.data)) {
          util.debug('Filtering resources by %j', filterCriteria.data);
          resources = _.filter(resources, filterCriteria);
          util.debug('%d resources matched the filter criteria', resources.length);
        }
    }
    
    return resources;
}

/**
 * Sets a deep property of the given object.
 *
 * @param   {object}    obj       - The object whose property is to be set.
 * @param   {string}    propName  - The deep property name (e.g. "Vet.Address.State")
 * @param   {*}         propValue - The value to set
 */
function setDeepProperty(obj, propName, propValue) {
  propName = propName.split('.');
  for (var i = 0; i < propName.length - 1; i++) {
    obj = obj[propName[i]] = obj[propName[i]] || {};
  }
  obj[propName[propName.length - 1]] = propValue;
}
