import { Box, Flex, Text, Button, HStack } from '@chakra-ui/react';
import { ChevronLeftIcon } from '@chakra-ui/icons';

interface HeaderProps {
    onBack: () => void;
    showBackButton: boolean;
}

export function Header({ onBack, showBackButton }: HeaderProps) {
    return (
        <Flex
            as="header"
            bg="gray.800" // Dark background for the header
            color="white"
            p={4}
            alignItems="center"
            justifyContent="space-between"
            boxShadow="md"
        >
            {/* Left side: Semantic Search branding */}
            <HStack spacing={2} ml={2}> {/* Added HStack and adjusted margin-left for spacing */}
                <Text fontSize="xl" fontWeight="bold" fontFamily="sans-serif">
                    Semantic Search AI
                </Text>
                <Text fontSize="xl" fontWeight="bold" color="superjoin.500" fontFamily="sans-serif">
                    Spreadsheet
                </Text>
            </HStack>

            {/* Right side: Back button (conditionally rendered) */}
            <Box>
                {showBackButton && (
                    <Button
                        onClick={onBack}
                        variant="outline"
                        borderColor="whiteAlpha.700"
                        color="whiteAlpha.900"
                        _hover={{ bg: 'whiteAlpha.200' }}
                        leftIcon={<ChevronLeftIcon />}
                        size="sm"
                        mr={2} // Margin to the right
                    >
                        Back
                    </Button>
                )}
            </Box>
        </Flex>
    );
}