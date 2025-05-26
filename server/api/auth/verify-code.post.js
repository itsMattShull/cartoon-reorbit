import bcrypt from 'bcryptjs'
import { PrismaClient } from '@prisma/client'
import { defineEventHandler, readBody, setCookie, sendRedirect } from 'h3'
import jwt from 'jsonwebtoken'
import { useRuntimeConfig } from '#imports'

export default defineEventHandler(async (event) => {
  const prisma = new PrismaClient()
  const config = useRuntimeConfig()

  // Parse and validate request body
  const { email, code } = await readBody(event)
  if (!email || !code || typeof email !== 'string' || typeof code !== 'string') {
    event.node.res.statusCode = 400
    return { error: 'Email and code are required' }
  }
  const providedCode = code.trim().padStart(6, '0')

  // Retrieve the most recent login code for this email
  const record = await prisma.emailLoginCode.findFirst({
    where: { email },
    orderBy: { createdAt: 'desc' }
  })
  if (!record || record.expiresAt < new Date()) {
    event.node.res.statusCode = 400
    return { error: 'Code expired or not found' }
  }

  // Verify the 6-digit code
  const isValid = await bcrypt.compare(providedCode, record.codeHash)
  if (!isValid) {
    event.node.res.statusCode = 400
    return { error: 'Incorrect code' }
  }

  // Upsert the user by email
  let user = await prisma.user.findUnique({ where: { email } })
  if (!user) {
    user = await prisma.user.create({ data: { email } })
  }

  // Clean up the used code
  await prisma.emailLoginCode.delete({ where: { id: record.id } })

  // Issue JWT, set cookie, and redirect
  const token = jwt.sign({ sub: user.id }, config.jwtSecret, { expiresIn: '30d' })
  setCookie(event, 'session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30,
    path: '/',
  })

  return sendRedirect(event, '/setup-username', 302)
})
