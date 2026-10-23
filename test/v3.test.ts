import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { moveDataFolder } from '../src/main/datafolder.ts'
import { CHANGELOG } from '../src/renderer/src/changelog.ts'

test("What's new: newest first, real dates, this version has its notes", () => {
  const num = (v: string): number => v.split('.').map(Number).reduce((a, n) => a * 1000 + n, 0)
  CHANGELOG.forEach((e, i) => {
    if (i > 0) assert.ok(num(CHANGELOG[i - 1].version) > num(e.version), e.version)
    assert.match(e.date, /^\d{4}-\d{2}-\d{2}$/)
    assert.ok(!Number.isNaN(Date.parse(e.date)), e.date)
    assert.ok(e.changes.length > 0, e.version)
  })
  const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }
  assert.equal(CHANGELOG[0].version, pkg.version)
})

test('data folder: moved whole, once, never mixed', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'steamradar-data-'))
  const from = path.join(root, 'steamradar')
  const to = path.join(root, 'ProtagonistLabs', 'SteamRadar')
  const fill = (dir: string, name: string): void => {
    mkdirSync(dir, { recursive: true })
    writeFileSync(path.join(dir, name), name)
  }
  try {
    fill(from, 'config.json')
    assert.equal(moveDataFolder(from, to), to)
    assert.ok(existsSync(path.join(to, 'config.json')) && !existsSync(from), 'moved whole')
    assert.equal(moveDataFolder(from, to), to, 'second start: nothing to do')

    fill(from, 'catalog.json')
    assert.equal(moveDataFolder(from, to), to)
    assert.ok(existsSync(path.join(from, 'catalog.json')) && !existsSync(path.join(to, 'catalog.json')), 'nothing mixed')

    rmSync(to, { recursive: true })
    mkdirSync(to)
    assert.equal(moveDataFolder(from, to), to)
    assert.ok(existsSync(path.join(to, 'catalog.json')) && !existsSync(from), 'an empty new folder counts as not there')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('data folder: a locked file keeps the old folder, nothing copied', { skip: process.platform !== 'win32' }, async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'steamradar-lock-'))
  const from = path.join(root, 'steamradar')
  const to = path.join(root, 'ProtagonistLabs', 'SteamRadar')
  mkdirSync(from)
  const file = path.join(from, 'history.json')
  writeFileSync(file, '{}')
  // held open without sharing, as a running copy would
  const holder = spawn('powershell.exe', ['-NoProfile', '-Command', `$f = [IO.File]::Open('${file}', 'Open', 'Read', 'None'); 'held'; Start-Sleep 20`])
  try {
    await new Promise((resolve) => holder.stdout.once('data', resolve))
    assert.equal(moveDataFolder(from, to), from)
    assert.ok(existsSync(file) && !existsSync(to), 'old folder kept, nothing in the new one')
  } finally {
    holder.kill()
    await new Promise((resolve) => holder.once('exit', resolve))
  }
  assert.equal(moveDataFolder(from, to), to, 'next start moves it')
  assert.ok(existsSync(path.join(to, 'history.json')))
  rmSync(root, { recursive: true, force: true })
})
