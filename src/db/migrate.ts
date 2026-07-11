import 'dotenv/config'
import { bootstrap } from './init'

const dbPath = process.env.DATABASE_URL ?? './data/notes.db'
const sqlite = bootstrap(dbPath)
console.log('Migrations complete.')
sqlite.close()