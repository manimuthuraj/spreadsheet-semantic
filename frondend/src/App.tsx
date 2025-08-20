import { useState } from 'react';
import { Box, Flex } from '@chakra-ui/react'; // Import Flex
import { SheetManagement } from './components/SheetManagement';
import { ChatInterface } from './components/ChatInterface';
import { Header } from './components/Headers'; // New Header component

function App() {
  const [currentSheetId, setCurrentSheetId] = useState<string | null>(null);
  const [currentSheetName, setCurrentSheetName] = useState<string | null>(null);

  const handleChatWithSheet = (sheetId: string, sheetName: string) => {
    setCurrentSheetId(sheetId);
    setCurrentSheetName(sheetName);
  };

  const handleBackToSheets = () => {
    setCurrentSheetId(null);
    setCurrentSheetName(null);
  };

  return (
    <Flex direction="column" minH="100vh" bg="gray.100">
      <Header onBack={handleBackToSheets} showBackButton={!!currentSheetId} />

      <Flex flex="1" p={8} justifyContent="center" alignItems="flex-start">
        <Box
          maxW="1200px"
          w="full"
          bg="white"
          boxShadow="lg"
          rounded="lg"
          p={8}
        >
          {!currentSheetId ? (
            <SheetManagement onChatWithSheet={handleChatWithSheet} />
          ) : (
            <ChatInterface
              spreadsheetId={currentSheetId}
              spreadSheetName={currentSheetName!}
              onBack={handleBackToSheets}
            />
          )}
        </Box>
      </Flex>
    </Flex>
  );
}

export default App;