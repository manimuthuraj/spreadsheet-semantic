import ClientOAuth2, { Options } from "client-oauth2";

const getOAuthOption = () => {
    return {
        clientId: process.env.CLIENT_ID,
        clientSecret: process.env.CLIENT_SECRET,
        accessTokenUri: "https://oauth2.googleapis.com/token",
        authorizationUri: "https://accounts.google.com/o/oauth2/auth?access_type=offline&prompt=consent",
        redirectUri: 'http://localhost:3001/auth/google/callback',
        scopes: ["https://www.googleapis.com/auth/spreadsheets", "https://www.googleapis.com/auth/userinfo.email"],
    }
}


export async function OauthURI(): Promise<string> {

    let oAuthOptions: ClientOAuth2.Options = getOAuthOption();
    // gen redirect route
    const oAuthObj = new ClientOAuth2(oAuthOptions);
    const uri = oAuthObj.code.getUri();
    return uri;
}


export async function getToken(originalUrl: string): Promise<ClientOAuth2.Token> {
    let oAuthOptions: Options = getOAuthOption();

    const oAuthObj = new ClientOAuth2(oAuthOptions);

    let tokenOptions: Options | undefined;
    tokenOptions = {
        body: {
            client_id: process.env.CLIENT_ID || "",
            client_secret: process.env.CLIENT_SECRET || "",
        },
    };
    const token = await oAuthObj.code.getToken(originalUrl, tokenOptions);
    console.log("ghjkl", token.accessToken, token)
    return token
}

export const refreshToken = async () => {

    let oAuthOptions: Options = getOAuthOption();

    const oauthTokenData = {
        access_token: process.env.ACCESS_TOKEN || "",
        expires_in: "3599",
        refresh_token: process.env.GOOGLE_REFRESH_TOKEN || "",
        scope: 'https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/spreadsheets openid',
        token_type: 'Bearer',
        id_token: 'eyJhbGciOiJSUzI1NiIsImtpZCI6IjhlOGZjOGU1NTZmN2E3NmQwOGQzNTgyOWQ2ZjkwYWUyZTEyY2ZkMGQiLCJ0eXAiOiJKV1QifQ.eyJpc3MiOiJodHRwczovL2FjY291bnRzLmdvb2dsZS5jb20iLCJhenAiOiI0OTQ5NDM2NTE4OS1mcHZzOTFuMnIya21haXRwamZpdjUwbnF2dHNtOWh1dC5hcHBzLmdvb2dsZXVzZXJjb250ZW50LmNvbSIsImF1ZCI6IjQ5NDk0MzY1MTg5LWZwdnM5MW4ycjJrbWFpdHBqZml2NTBucXZ0c205aHV0LmFwcHMuZ29vZ2xldXNlcmNvbnRlbnQuY29tIiwic3ViIjoiMTE0NzMxMTg1OTkyNTI2MjI2OTg0IiwiZW1haWwiOiJtYW5pbXV0aHVyYWoudGVjaEBnbWFpbC5jb20iLCJlbWFpbF92ZXJpZmllZCI6dHJ1ZSwiYXRfaGFzaCI6IlpOTjlsUVFRenRSU1VYV2pZZUZ4M1EiLCJpYXQiOjE3NTIwNzgxNTIsImV4cCI6MTc1MjA4MTc1Mn0.d2ifWeg71RT1iSIxg3_sfL_Y-Eu53mZtOTuniNL66fMNqw_uhRlKxyoGIAc_MuTccNmKygofJUni4w9x4v5uvJXrITTMPZU9Bz2LCy9ZFvkTb3HkOeHmu-rORDApJCpnjYi9Z1kwizQiHo63zpIslmkBnGEIxP2YG_CvtpvgcVTmhO0zt-mnO4BSVjnXPKEOzqSG9lWJS2AJ7G3lXJuT1UO6_pwIF2twnYxJg_bIJe9Eb1ivVOKZt31weyLZIO84myrb90ptyEb69zcIp133q4Z5PuSk7KGwR_EA5aLSgJnrcy8gnzbqLcaO9SlD-BdRBtXFsZDGt7JRT5WU6y_rBw'
    }
    const oAuthObj = new ClientOAuth2(oAuthOptions);
    const token = oAuthObj.createToken(oauthTokenData);
    const newToken = (await token.refresh(oAuthOptions)).data;
    console.log(newToken)
    return newToken

}