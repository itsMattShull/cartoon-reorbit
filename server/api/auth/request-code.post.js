import { randomInt } from 'crypto'
import bcrypt from 'bcryptjs'
import { PrismaClient } from '@prisma/client'
import { defineEventHandler, readBody } from 'h3'
import { sendEmail } from '../../utils/mail'

const prisma = new PrismaClient()

export default defineEventHandler(async (event) => {
  // Parse request body
  const { email } = await readBody(event)

  // Basic validation
  if (!email || typeof email !== 'string' || !/^\S+@\S+\.\S+$/.test(email)) {
    event.node.res.statusCode = 400
    return { error: 'Invalid email address' }
  }

  // TODO: add rate‑limiting (e.g. max 3 requests/hour per email or IP)

  // Generate a 6‑digit code
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0')
  const codeHash = await bcrypt.hash(code, 10)
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000) // 10 minutes

  // Clean up any existing codes for this email
  // await prisma.emailLoginCode.deleteMany({ where: { email } })

  // Store the new code
  await prisma.emailLoginCode.create({
    data: { email, codeHash, expiresAt }
  })

  // Send the code via email
  try {
    await sendEmail({
      to: email,
      subject: 'Your login code',
      text: `Your login code is ${code}. It expires in 10 minutes.`
    })
  } catch (err) {
    console.error('Failed to send login code email:', err)
    event.node.res.statusCode = 500
    return { error: 'Unable to send email. Please try again later.' }
  }

  // Success
  return { success: true }
})
