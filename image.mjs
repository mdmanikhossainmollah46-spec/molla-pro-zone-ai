// Molla Pro Zone AI
// Developer: Manik Hossain Molla

import { createClient } from "@supabase/supabase-js";


export async function handler(event) {

  try {

    const body = JSON.parse(event.body);


    const username = body.username;
    const password = body.password;


    if (!username || !password) {

      return {
        statusCode:400,
        body:JSON.stringify({
          success:false,
          message:"Missing username or password"
        })
      };

    }


    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );


    const { data:userProfile, error:profileError } =
      await supabase
      .from("profiles")
      .select("email")
      .eq("username", username)
      .single();


    if(profileError || !userProfile){

      return {
        statusCode:401,
        body:JSON.stringify({
          success:false,
          message:"Username not found"
        })
      };

    }


    const authClient = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY
    );


    const { data:loginResult, error:loginError } =
      await authClient.auth.signInWithPassword({

        email:userProfile.email,
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

        user:loginResult.user,

        session:loginResult.session

      })

    };


  } catch(error) {


    return {

      statusCode:500,

      body:JSON.stringify({

        success:false,

        message:error.message

      })

    };


  }

}