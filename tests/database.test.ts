import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
vi.mock('electron', () => ({ app: { getAppPath: () => process.cwd(), getPath: () => os.tmpdir() } }))
import * as database from '../electron/database'
let dir: string, file: string
beforeEach(async () => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'order-db-')); file = path.join(dir, 'orders.db'); await database.initDatabase(file); database.run('CREATE TABLE checks (value INTEGER UNIQUE)'); database.run('INSERT INTO checks VALUES (1)') })
afterEach(() => { vi.restoreAllMocks(); database.closeDatabase(); fs.rmSync(dir, { recursive: true, force: true }) })
describe('transactional persistence', () => {
  it('rolls back all statements and leaves disk unchanged when a later statement fails', () => {
    const before = fs.readFileSync(file)
    expect(() => database.withTransaction(() => { database.run('INSERT INTO checks VALUES (2)'); database.run('INSERT INTO checks VALUES (1)') })).toThrow(/UNIQUE/)
    expect(database.queryAll('SELECT value FROM checks')).toEqual([{ value: 1 }])
    expect(fs.readFileSync(file)).toEqual(before)
  })
  it('persists a multi-statement business operation only once', () => {
    const replace = vi.spyOn(fs, 'renameSync')
    database.withTransaction(() => { database.run('INSERT INTO checks VALUES (2)'); database.run('INSERT INTO checks VALUES (3)') })
    expect(replace.mock.calls.filter(call => call[1] === file)).toHaveLength(1)
    expect(database.queryAll('SELECT value FROM checks')).toHaveLength(3)
  })
  it('restores memory as well as disk after an atomic replacement failure', () => {
    const before = fs.readFileSync(file), rename = fs.renameSync
    vi.spyOn(fs, 'renameSync').mockImplementation((from, to) => { if (to === file) throw new Error('Disk full'); return rename(from, to) })
    expect(() => database.run('INSERT INTO checks VALUES (2)')).toThrow('Disk full')
    expect(database.queryAll('SELECT value FROM checks')).toEqual([{ value: 1 }])
    expect(fs.readFileSync(file)).toEqual(before)
  })
  it('restores a valid backup instead of replacing a corrupt database with an empty one', async () => {
    database.backupDatabase('manual')
    database.run('INSERT INTO checks VALUES (2)')
    database.closeDatabase(); fs.writeFileSync(file, 'corrupted')
    await database.initDatabase(file)
    expect(database.queryAll('SELECT value FROM checks')).toEqual([{ value: 1 }])
    expect(fs.readdirSync(dir).some(name => name.includes('corrupt'))).toBe(true)
  })
})
