import mongoose from "mongoose"

if (!process.env.MONGODB_URI) throw new Error("Mongodb URL not found")

mongoose.connect(process.env.MONGODB_URI).then((a) => {
    console.log("connnected")
}).catch((err) => {
    console.log("err", err)
})