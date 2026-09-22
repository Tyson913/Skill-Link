import {createClient} from '@supabase/supabase.js';
import 'dotenv/config';

const supabase = createClient(process.env.supaprojectlink, process.env.sbpublishablekey);

export async function login(email, password) {
    const {data, error} = await supabase.auth.signInWithPassword({
        email: email,
        password: password
    })
}

export async function signup(email, password){
    const {data, error} = await supabase.auth.signup({
        email: email,
        password: password
    })
}
