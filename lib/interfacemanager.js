'use strict';

const debug = require('debug')('modelproxy');
const fs = require('fs');

/**
 * InterfaceManager
 * @param {String|Object} path The file path of inteface configuration or the interface object
 */
class InterfaceManager {
	constructor(path, options) {
		this._path = path;

		// {Object} Interface Mapping, The key is interface id and
		// the value is a json profile for this interface.
		this._interfaceMap = {};

		// {String} The path of rulebase where the interface rules is stored. This value will be override
		// if user specified the path of rulebase in interface.json.
		this._rulebase = typeof path === 'string' ? path.replace(/\/[^\/]*$/, '/interfaceRules') : '';

		typeof path === 'string'
			? this._loadProfilesFromPath(path, options)
			: this._loadProfiles(path, options);
	}

	// @throws errors
	_loadProfilesFromPath(path, options) {
		debug(`Loading interface profiles.\nPath = ${path}`);

		let profiles;
		try {
			profiles = fs.readFileSync(path, { encoding: 'utf8' });
		} catch (e) {
			throw new Error('Fail to load interface profiles.' + e);
		}
		try {
			profiles = JSON.parse(profiles);
		} catch (e) {
			throw new Error('Interface profiles has syntax error:' + e);
		}
		this._loadProfiles(profiles, options);
	}

	_loadProfiles(profiles, options) {
		if (!profiles) return;

		debug(`Title: ${profiles.title}, Version: ${profiles.version}`);

		this._rulebase = profiles.rulebase
			? (profiles.rulebase || './').replace(/\/$/, '')
			: this._rulebase;

		// {String} The mock engine name.
		this._engine = profiles.engine || 'mockjs';

		if (options && options.status) {
			profiles.status = options.status;
		}

		if (profiles.status === undefined) {
			throw new Error('There is no status specified in interface configuration!');
		}

		// {String} The interface status in using.
		this._status = profiles.status;

		(profiles.interfaces || []).forEach(item => {
			this._addProfile(item) && debug(`Interface[${item.id}] is loaded.`);
		});
	}

	getProfile(interfaceId) {
		return this._interfaceMap[interfaceId];
	}

	getRule(interfaceId) {
		if (!interfaceId || !this._interfaceMap[interfaceId]) {
			throw new Error(`The interface profile ${interfaceId} is not found.`);
		}

		let path = this._interfaceMap[interfaceId].ruleFile;
		if (!fs.existsSync(path)) {
			throw new Error(`The rule file is not existed.\npath = ${path}`);
		}

		let rulefile;
		try {
			rulefile = fs.readFileSync(path, { encoding: 'utf8' });
		} catch (e) {
			throw new Error(`Fail to read rulefile of path ${path}`);
		}

		try {
			return JSON.parse(rulefile);
		} catch (e) {
			throw new Error(`Rule file has syntax error. ' + e + '\npath= ${path}`);
		}
	}

	getEngine() {
		return this._engine;
	}

	getStatus() {
		return this._status;
	}

	// @return Array
	getInterfaceIdsByPrefix(pattern) {
		if (!pattern) return [];
		let ids = [];
		let map = this._interfaceMap;
		let len = pattern.length;
		for (let id in map) {
			if (id.slice(0, len) === pattern) {
				ids.push(id);
			}
		}
		return ids;
	}

	isProfileExisted(interfaceId) {
		return !!this._interfaceMap[interfaceId];
	}

	_addProfile(prof) {
		if (!prof || !prof.id) {
			console.error('Can not add interface profile without id!');
			return false;
		}
		if (!/^((\w+\.)*\w+)$/.test(prof.id)) {
			console.error(`Invalid id: ${prof.id}`);
			return false;
		}
		if (this.isProfileExisted(prof.id)) {
			console.error(`Can not repeat to add interface [${prof.id}]! Please check your interface configuration file!`);
			return false;
		}

		prof.ruleFile = this._rulebase + '/' + (prof.ruleFile || `${prof.id}.rule.json`);

		if (!this._isUrlsValid(prof.urls) && !fs.existsSync(prof.ruleFile)) {
			console.error(`Profile is deprecated:\n' ${prof} '\nNo urls is configured and No ruleFile is available`);
			return false;
		}
		if (!(prof.status in prof.urls || prof.status === 'mock' || prof.status === 'mockerr')) {
			prof.status = this._status;
		}

		prof.method = { POST: 'POST', GET: 'GET' }[(prof.method || 'GET').toUpperCase()];
		prof.dataType = { json: 'json', text: 'text', jsonp: 'jsonp' }[(prof.dataType || 'json').toLowerCase()];
		prof.isRuleStatic = !!prof.isRuleStatic || false;
		prof.isCookieNeeded = !!prof.isCookieNeeded || false;
		prof.signed = !!prof.signed || false;
		prof.timeout = prof.timeout || 10000;
		prof.encoding = prof.encoding || 'utf8';
		// prof.format
		// prof.filter         = ...
		this._interfaceMap[prof.id] = prof;

		return true;
	}

	_isUrlsValid(urls) {
		if (!urls) return false;
		for (var i in urls) {
			return true;
		}
		return false;
	}
}

module.exports = InterfaceManager;
