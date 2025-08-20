
import "./dot-env.config"
import "./model/dbConnection"
import { Factuality } from "autoevals";
import { searchData } from "./service/sheets.service";
import OpenAI from 'openai';

export const openai = new OpenAI({
    apiKey: process.env.OPENAI_APIKEY
});

(async () => {
    const input = "Q1 Revenue of year 1";
    const output = (await searchData('1vIBW453mpOzsfsoJURxAvmN3ffT4R1g4iyFeT1QnDY4', input)).result;
    const expected = "Result should contain revenue of year 1";


    const result = await Factuality({
        //@ts-expect-error
        client: openai,
        model: "gpt-3.5-turbo",
        output,
        expected,
        input,
    });

    console.log(`Factuality score: ${result.score}`);
    console.log(`Factuality metadata: ${result.metadata?.rationale}`);
})();