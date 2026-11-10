export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context)
  } catch (error) {
    if (specifier.startsWith('.') && context.parentURL?.includes('/functions/src/')) {
      if (specifier.endsWith('.js')) return nextResolve(specifier.slice(0, -3) + '.ts', context)
      if (!/\.[a-z]+$/.test(specifier)) return nextResolve(specifier + '.ts', context)
    }
    throw error
  }
}
