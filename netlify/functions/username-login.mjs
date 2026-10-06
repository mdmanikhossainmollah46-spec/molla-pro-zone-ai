// Molla Pro Zone AI
// Username Login Function
// Developer: Manik Hossain Molla

import { createClient } from "@supabase/supabase-js";


const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;


const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);


const adminClient = createClient(
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY
);



export async function handler(event) {


  if (event.httpMethod !== "POST") {

    return {
      statusCode: 405,
      body: JSON.stringify({
        success:false,
        message:"Only POST request allowed"
      })
    };

  }



  try {


    const requestBody = JSON.parse(event.body);


    const username = requestBody.username;
    const password = requestBody.password;



    if (!username || !password) {


      return {

        statusCode:400,

        body:JSON.stringify({

          success:false,

          message:"Username and password required"

        })

      };


    }




    // Find email using username

    const {
      data: userProfile,
      error: profileFetchError

    } = await adminClient

      .from("profiles")

      .select("email")

      .eq("username", username)

      .single();




    if (profileFetchError || !userProfile) {


      return {

        statusCode:401,

        body:JSON.stringify({

          success:false,

          message:"Invalid username"

        })

      };


    }




    // Login user

    const {

      data: authResult,

      error: loginError

    } = await supabase.auth.signInWithPassword({

      email:userProfile.email,

      password:password

    });





    if (loginError) {


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


        user:authResult.user,


        session:authResult.session


      })


    };




  } catch (serverError) {


    return {


      statusCode:500,


      body:JSON.stringify({


        success:false,


        message:"Internal server error",


        error:serverError.message


      })


    };


  }


}
