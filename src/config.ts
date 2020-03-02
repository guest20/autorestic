import { readFileSync, writeFileSync, statSync, copyFileSync } from 'fs'
import { resolve } from 'path'
import { homedir } from 'os'

import yaml from 'js-yaml'

import { flags } from './autorestic'
import { Backend, Config } from './types'
import { makeArrayIfIsNot, makeObjectKeysLowercase, rand } from './utils'



export enum LocationFromPrefixes {
	Filesystem,
	DockerVolume
}


export const normalizeAndCheckBackends = (config: Config) => {
	config.backends = makeObjectKeysLowercase(config.backends)

	for (const [name, { type, path, key, ...rest }] of Object.entries(
		config.backends,
	)) {
		if (!type || !path)
			throw new Error(
				`The backend "${name}" is missing some required attributes`,
			)

		const tmp: any = {
			type,
			path,
			key: key || rand(128),
		}
		for (const [key, value] of Object.entries(rest))
			tmp[key.toUpperCase()] = value

		config.backends[name] = tmp as Backend
	}
}

export const normalizeAndCheckBackups = (config: Config) => {
	config.locations = makeObjectKeysLowercase(config.locations)
	const backends = Object.keys(config.backends)

	const checkDestination = (backend: string, backup: string) => {
		if (!backends.includes(backend))
			throw new Error(`Cannot find the backend "${backend}" for "${backup}"`)
	}

	for (const [name, { from, to, ...rest }] of Object.entries(
		config.locations,
	)) {
		if (!from || !to)
			throw new Error(
				`The backup "${name}" is missing some required attributes`,
			)

		for (const t of makeArrayIfIsNot(to))
			checkDestination(t, name)
	}
}

const findConfigFile = (): string | undefined => {
	const config = '.autorestic.yml'
	const paths = [
		resolve(flags.config || ''),
		resolve('./' + config),
		homedir() + '/' + config,
	]
	for (const path of paths) {
		try {
			const file = statSync(path)
			if (file.isFile()) return path
		} catch (e) {
		}
	}
}

export let CONFIG_FILE: string = ''

export const init = (): Config | undefined => {
	const file = findConfigFile()
	if (file) CONFIG_FILE = file
	else return

	const raw: Config = makeObjectKeysLowercase(
		yaml.safeLoad(readFileSync(CONFIG_FILE).toString()),
	)

	const current = JSON.stringify(raw)

	normalizeAndCheckBackends(raw)
	normalizeAndCheckBackups(raw)

	const changed = JSON.stringify(raw) !== current

	if (changed) {
		const OLD_CONFIG_FILE = CONFIG_FILE + '.old'
		copyFileSync(CONFIG_FILE, OLD_CONFIG_FILE)
		writeFileSync(CONFIG_FILE, yaml.safeDump(raw))
		console.log(
			'\n' +
			'⚠️ MOVED OLD CONFIG FILE TO: ⚠️'.red.underline.bold +
			'\n' +
			OLD_CONFIG_FILE +
			'\n' +
			'What? Why? '.grey + 'https://git.io/Jv2D0'.underline.grey +
			'\n'
		)
	}

	return raw
}
