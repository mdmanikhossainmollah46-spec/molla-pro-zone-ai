// username-login.mjs
// Molla Pro Zone AI
// Developer: Manik Hossain Molla

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(
  supabaseUrl,
  supabaseAnonKey
);

const admin = createClient(
  supabaseUrl,
  supabaseServiceKey
);


export async function handler(event) {

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({
        success:false,
        message:"Method not allowed"
      })
    };
  }


  try {

    const body = JSON.parse(event.body);

    const username = body.username;
    const password = body.password;


    if(!username || !password){

      return {
        statusCode:400,
        body:JSON.stringify({
          success:false,
          message:"Username and password required"
        })
      };

    }


    // Find user email from username

    const { data:profile, error:profileError } =
      await admin
      .from("profiles")
      .select("email")
      .eq("username", username)
      .single();


    if(profileError || !profile){

      return {
        statusCode:401,
        body:JSON.stringify({
          success:false,
          message:"Username not found"
        })
      };

    }


    // Login with email password

    const { data:loginData, error:loginError } =
      await supabase.auth.signInWithPassword({

        email:profile.email,
        password:password

      });



    if(loginError){

      return {
        statusCode:401,
        body:JSON.stringify({
          success:false,
          message:loginError.message
        })
      };

    }



    return {

      statusCode:200,

      body:JSON.stringify({

        success:true,

        message:"Login successful",

        user:loginData.user,

        session:loginData.session

      })

    };


  } catch(err){


    return {

      statusCode:500,

      body:JSON.stringify({

        success:false,

        message:"Server error",

        error:err.message

      })

    };


  }

}
