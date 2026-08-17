import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import App from './App'

afterEach(cleanup)

describe('App', () => {
  it('renders the Sentry Sonar heading', () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: /sentry sonar/i })).toBeTruthy()
  })
})
