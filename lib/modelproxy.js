'use strict';

// Dependencies
const util = require('util');
const InterfaceManager = require('./interfacemanager');
const ProxyFactory = require('./proxyfactory');

/**
 * ModelProxy Constructor
 * @param {Object|Array|String} profile. This profile describes what the model looks
 * like. eg:
 * profile = {
 *    getItems: 'Search.getItems',
 *    getCart: 'Cart.getCart'
 * }
 * profile = ['Search.getItems', 'Cart.getCart']
 * profile = 'Search.getItems'
 * profile = 'Search.*'
 */
class ModelProxy {
	constructor(profile) {
		if (!profile) return;

		if (typeof profile === 'string') {
			// Get ids via prefix pattern like 'packageName.*'
			if (/^(\w+\.)+\*$/.test(profile)) {
				profile = ProxyFactory.getInterfaceIdsByPrefix(profile.replace(/\*$/, ''));
			} else {
				profile = [profile];
			}
		}

		if (profile instanceof Array) {
			let prof = {};
			let methodName;
			for (let i = profile.length - 1; i >= 0; i--) {
				methodName = profile[i];
				methodName = methodName.substring(methodName.lastIndexOf('.') + 1);
				if (!prof[methodName]) {
					prof[methodName] = profile[i];
				} else {
					methodName = profile[i].replace(/\./g, '_');
					prof[methodName] = profile[i];
				}
			}
			profile = prof;
		}

		// Construct the model following the profile
		for (let method in profile) {
			this[method] = (function (methodName, interfaceId) {
				let proxy = ProxyFactory.create(interfaceId);
				return function (params, callback) {
					params = params || {};

					if (!this._queue) {
						this._queue = [];
					}
					// Push this method call into request queue. Once the done method
					// is called, all requests in this queue will be sent.
					this._queue.push({
						params: params,
						proxy: proxy,
						callback: callback
					});
					return this;
				};
			})(method, profile[method]);
		}
	}

	withCookie(cookie) {
		this._cookies = cookie;
		return this;
	}

	/**
	 * 同Promise.then
	 * @param  {any} callback
	 * @param  {any} errCallback
	 */
	then(callback, errCallback) {
		let self = this;
		let queue = self._queue;
		let cookie = self._cookie;

		self._queue = self._cookie = null;

		if (!queue) {
			callback.apply(self);
			return self;
		}

		return new Promise((resolve, reject) => {
			let item = queue[0];
			item.proxy.request(
				item.params,
				value => resolve(typeof item.callback === 'function' ? item.callback(value) : value),
				reject,
				cookie
			);
			queue = cookie = null;
		}).then(callback, errCallback);
	}

	/**
	 * 同Promise.catch
	 * @param  {any} errCallback
	 */
	catch(errCallback) {
		return this.then(null, errCallback);
	}

	/**
	 * 同Promise.all
	 */
	all() {
		let self = this;
		let queue = self._queue;
		let cookie = self._cookie;

		self._queue = self.cookie = null;

		if (!queue) return self;

		let promises = queue.map(item => {
			return new Promise((resolve, reject) => {
				item.proxy.request(
					item.params,
					value => {
						let val = typeof item.callback === 'function' ? item.callback(value) : value;
						(util.isError(val) ? reject : resolve)(val);
					},
					error => reject(error),
					cookie
				);
			});
		});

		queue = cookie = null;

		return Promise.all(promises);
	}

	/**
	 * 并行执行
	 * 有错误不会阻断后续执行
	 * @param  {any} errCallback
	 */
	paral(errCallback) {
		let self = this;
		let queue = self._queue;
		let cookie = self._cookie;

		self._queue = self.cookie = null;

		if (!queue) return self;

		let promises = queue.map(item => {
			return new Promise((resolve) => {
				item.proxy.request(
					item.params,
					value => resolve(typeof item.callback === 'function' ? item.callback(value) : value),
					error => resolve(typeof errCallback === 'function' ? errCallback(error) : error),
					cookie
				);
			});
		});

		queue = cookie = null;

		return Promise.all(promises);
	}

	/**
	 * 串行执行
	 * 按调用顺序依次执行，方法传参要求为function，返回接口所需参数对象
	 */
	series() {
		let self = this;
		let queue = self._queue;
		let cookie = self._cookie;

		self._queue = self.cookie = null;

		if (!queue) return self;

		return new Promise((resolve, reject) => {
			let results = [];
			let handle = (index, item) => {
				let params = typeof item.params === 'function' ? item.params(results[index - 1], results) : item.params;
				if (!isObject(params)) {
					return reject(new Error('requset params get faile: interfaceId:' + item.proxy._opt.id), item.proxy._opt.id);
				}

				item.proxy.request(
					params,
					value => {
						if (typeof item.callback === 'function') {
							let valueCallback = item.callback(value);
							if (util.isError(valueCallback)) {
								return reject(valueCallback, item.proxy._opt.id);
							} else {
								value = valueCallback;
							}
						}

						results[index] = value;
						index++;
						if (index >= queue.length) {
							queue = cookie = null;
							resolve(results);
						} else {
							handle(index, queue[index]);
						}
					},
					error => reject(error, item.proxy._opt.id),
					cookie
				);
			};
			// 执行
			handle(0, queue[0]);
		});
	}

	/**
 	 * ModelProxy.init
 	 * @param {String} path The path refers to the interface configuration file.
 	 */
	static init(path) {
		ProxyFactory.use(new InterfaceManager(path));
	}

	static create(profile) {
		return new this(profile);
	}
}

function isObject(obj) {
	return Object.prototype.toString.call(obj) === '[object Object]';
}

module.exports = ModelProxy;
