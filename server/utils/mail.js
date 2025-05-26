import nodemailer from 'nodemailer'
import { useRuntimeConfig } from '#imports'

// Initialize transporter using SMTP settings from runtime config
const config = useRuntimeConfig()
const transporter = nodemailer.createTransport({
  host: config.smtp.host,
  port: config.smtp.port,
  secure: config.smtp.secure,
  auth: {
    user: config.smtp.user,
    pass: config.smtp.pass,
  },
})

/**
 * Send an email via configured SMTP transporter
 * @param {{ to: string; subject: string; text?: string; html?: string; from?: string }} options
 */
export async function sendEmail(options) {
  // Use provided from address or fallback to SMTP user
  const fromAddress = options.from || config.smtp.from || config.smtp.user

  const mailOptions = {
    from: fromAddress,
    to: options.to,
    subject: options.subject,
    text: options.text,
    html: options.html,
    // Ensure envelope.from matches authenticated user when sending
    envelope: {
      from: fromAddress,
      to: options.to,
    },
  }

  try {
    const info = await transporter.sendMail(mailOptions)
    console.log(`Email sent: ${info.messageId}`)
    return info
  } catch (err) {
    console.error('sendEmail error:', err)
    throw err
  }
}
