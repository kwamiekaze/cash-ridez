#!/bin/bash
# Fix text colors for dark theme

# Replace in Community.tsx
sed -i 's/text-gray-900 dark:text-white/text-white/g' src/pages/Community.tsx

# Replace in Terms.tsx  
sed -i 's/text-gray-900 dark:text-white/text-white/g' src/pages/Terms.tsx
sed -i 's/text-xl font-bold mb-3 text-gray-900 dark:text-white/text-xl font-bold mb-3 text-white/g' src/pages/Terms.tsx

# Replace in Privacy.tsx
sed -i 's/text-gray-900 dark:text-white/text-white/g' src/pages/Privacy.tsx
sed -i 's/text-xl font-semibold mb-3 text-gray-900 dark:text-white/text-xl font-semibold mb-3 text-white/g' src/pages/Privacy.tsx

echo "Text colors fixed for dark theme"
