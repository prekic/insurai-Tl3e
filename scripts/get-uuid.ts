import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
dotenv.config()

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function go() {
  const { data, error } = await supabase.auth.admin.listUsers()
  if (error) {
    console.error('Error:', error)
  } else {
    const user = data.users.find((u: any) => u.email === 'prekic@gmail.com') || data.users[0]
    if (user) {
      console.log(user.id)
    } else {
      console.log('No user found')
    }
  }
}

go()
